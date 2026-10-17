import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/src/db/client";
import {
  demoImports,
  syncChanges,
  syncState,
  type JsonObject,
} from "@/src/db/schema";
import { ApiError, badRequest, conflict } from "@/src/lib/api-error";
import { boundedJsonPayload, entityTypeSchema, parseEntityPayload } from "@/src/modules/sync/dto";
import { canonicalRequestHash } from "@/src/modules/sync/encoding";
import { asJsonValue, readEntityVersion, resolveEntityPayload, upsertEntity } from "@/src/modules/sync/entities";

export const demoImportSchema = z
  .object({
    entities: z
      .array(
        z
          .object({
            entityId: z.string().trim().min(1).max(255),
            entityType: entityTypeSchema,
            payload: boundedJsonPayload,
          })
          .strict(),
      )
      .min(1)
      .max(100),
    importId: z.uuid(),
    schemaVersion: z.literal(1),
  })
  .strict()
  .superRefine((value, context) => {
    const keys = new Set<string>();
    value.entities.forEach((entity, index) => {
      const key = `${entity.entityType}\u0000${entity.entityId}`;
      if (keys.has(key)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate entityType/entityId in import",
          path: ["entities", index],
        });
      }
      keys.add(key);
    });
  });

export async function importDemo(
  userId: string,
  input: z.infer<typeof demoImportSchema>,
) {
  const entities = input.entities.map((entity) => ({
    ...entity,
    payload: parseEntityPayload(entity.entityType, entity.payload),
  }));
  const snapshotHash = canonicalRequestHash({
    entities,
    schemaVersion: input.schemaVersion,
  });

  try {
    return await getDatabase().transaction(async (transaction) => {
    const [state] = await transaction
      .select({ nextSequence: syncState.nextSequence })
      .from(syncState)
      .where(eq(syncState.userId, userId))
      .for("update");
    if (!state) throw new Error("Sync state was not initialized");

    const [existingImport] = await transaction
      .select({ receipt: demoImports.receipt, snapshotHash: demoImports.snapshotHash })
      .from(demoImports)
      .where(
        and(eq(demoImports.userId, userId), eq(demoImports.importId, input.importId)),
      )
      .limit(1);
    if (existingImport) {
      if (existingImport.snapshotHash !== snapshotHash) {
        throw conflict(
          "IMPORT_ID_REUSE",
          "This importId was already used for a different snapshot",
        );
      }
      return { duplicate: true, ...existingImport.receipt };
    }

    const [existingChange] = await transaction
      .select({ sequence: syncChanges.sequence })
      .from(syncChanges)
      .where(eq(syncChanges.userId, userId))
      .limit(1);
    if (existingChange) {
      throw conflict(
        "IMPORT_TARGET_NOT_EMPTY",
        "Demo import requires an empty account; merge policy is not enabled",
      );
    }

    let sequence = state.nextSequence;
    for (const entity of entities) {
      const current = await readEntityVersion(
        transaction,
        userId,
        entity.entityType,
        entity.entityId,
      );
      if (current) {
        throw conflict(
          "IMPORT_TARGET_NOT_EMPTY",
          "Demo import found existing account data",
        );
      }
      const payload = await resolveEntityPayload(transaction, userId, entity.entityType, entity.payload, entity.entityId);
      await upsertEntity(
        transaction,
        userId,
        entity.entityType,
        entity.entityId,
        payload,
        BigInt(1),
      );
      await transaction.insert(syncChanges).values({
        userId,
        sequence,
        entityType: entity.entityType,
        entityId: entity.entityId,
        entityVersion: BigInt(1),
        operation: "upsert",
        payload: asJsonValue(payload),
      });
      sequence += BigInt(1);
    }

    await transaction
      .update(syncState)
      .set({ nextSequence: sequence, updatedAt: new Date() })
      .where(eq(syncState.userId, userId));

    const receipt = {
      importedCount: entities.length,
      lastSequence: (sequence - BigInt(1)).toString(),
      status: "imported",
    };
    await transaction.insert(demoImports).values({
      userId,
      importId: input.importId,
      snapshotHash,
      idMapping: {},
      receipt: receipt as JsonObject,
    });

      return { duplicate: false, ...receipt };
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const code =
      error && typeof error === "object" && "code" in error
        ? Reflect.get(error, "code")
        : null;
    if (code === "23503" || code === "23505" || code === "23514") {
      throw badRequest(
        "IMPORT_DOMAIN_CONSTRAINT",
        "The demo snapshot conflicts with a domain rule",
      );
    }
    throw error;
  }
}

