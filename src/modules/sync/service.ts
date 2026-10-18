import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { ZodError } from "zod";

import { getDatabase } from "@/src/db/client";
import {
  customPrograms,
  legacyUserMetadata,
  mealEntries,
  operationReceipts,
  placeFavorites,
  profiles,
  socialDrafts,
  syncChanges,
  syncState,
  trainingPreferences,
  userExercises,
  userPreferences,
  workoutSessions,
} from "@/src/db/schema";
import type { JsonObject, JsonValue } from "@/src/db/schema";
import { ApiError, conflict } from "@/src/lib/api-error";

import { parseEntityPayload, type EntityType, type SyncOperation } from "./dto";
import { canonicalRequestHash, decodeCursor, encodeCursor } from "./encoding";
import { lockActiveAccount } from "@/src/modules/accounts/access";
import {
  asJsonValue,
  latestEntityPayload,
  readEntityVersion,
  resolveEntityPayload,
  tombstoneEntity,
  upsertEntity,
  validateEntityTransition,
} from "./entities";

interface PushInput {
  deviceId: string;
  operations: SyncOperation[];
  schemaVersion: 1;
}

interface LockedSyncState {
  epoch: string;
  nextSequence: bigint;
}

interface SnapshotItem {
  entityId: string;
  payload: JsonValue;
  updatedAt: string;
  version: string;
}

function validationDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path.join("."),
  }));
}

function postgresCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = Reflect.get(error, "code");
    return typeof code === "string" ? code : null;
  }
  return null;
}

async function lockSyncState(
  transaction: Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0],
  userId: string,
): Promise<LockedSyncState> {
  await lockActiveAccount(transaction, userId);
  const rows = await transaction
    .select({ epoch: syncState.epoch, nextSequence: syncState.nextSequence })
    .from(syncState)
    .where(eq(syncState.userId, userId))
    .for("update");
  const state = rows[0];
  if (!state) throw new Error("Sync state was not initialized");
  return state;
}

function rejected(operationId: string, code: string, message: string, details?: unknown) {
  return {
    operationId,
    status: "rejected" as const,
    error: { code, message, ...(details === undefined ? {} : { details }) },
  };
}

async function applyOperation(userId: string, operation: SyncOperation) {
  const database = getDatabase();
  const requestHash = canonicalRequestHash(operation);

  try {
    return await database.transaction(async (transaction) => {
      const state = await lockSyncState(transaction, userId);
      const [receipt] = await transaction
        .select({ requestHash: operationReceipts.requestHash, result: operationReceipts.result })
        .from(operationReceipts)
        .where(
          and(
            eq(operationReceipts.userId, userId),
            eq(operationReceipts.operationId, operation.operationId),
          ),
        )
        .limit(1);

      if (receipt) {
        if (receipt.requestHash !== requestHash) {
          return rejected(
            operation.operationId,
            "OPERATION_ID_REUSE",
            "This operationId was already used for different content",
          );
        }
        return {
          operationId: operation.operationId,
          status: "duplicate" as const,
          result: receipt.result,
        };
      }

      let payload: unknown = null;
      if (operation.action === "upsert") {
        if (operation.payload === undefined) {
          return rejected(
            operation.operationId,
            "PAYLOAD_REQUIRED",
            "An upsert operation requires payload",
          );
        }
        try {
          payload = parseEntityPayload(operation.entityType, operation.payload);
        } catch (error) {
          if (error instanceof ZodError) {
            return rejected(
              operation.operationId,
              "ENTITY_VALIDATION_ERROR",
              "The entity payload is invalid",
              validationDetails(error),
            );
          }
          throw error;
        }
      } else if (operation.payload !== undefined) {
        return rejected(
          operation.operationId,
          "DELETE_PAYLOAD_NOT_ALLOWED",
          "A delete operation cannot contain payload",
        );
      }

      const current = await readEntityVersion(
        transaction,
        userId,
        operation.entityType,
        operation.entityId,
      );
      const baseVersion = BigInt(operation.baseVersion);

      if (current?.deletedAt && operation.action === "delete") {
        return rejected(
          operation.operationId,
          "ENTITY_ALREADY_DELETED",
          "The entity is already deleted",
          { currentVersion: current.version.toString() },
        );
      }
      if (!current && operation.action === "delete") {
        return rejected(
          operation.operationId,
          "ENTITY_NOT_FOUND",
          "The entity does not exist",
        );
      }

      const expectedVersion = current?.version ?? BigInt(0);
      if (baseVersion !== expectedVersion) {
        return {
          operationId: operation.operationId,
          status: "conflict" as const,
          conflict: {
            code: "VERSION_CONFLICT",
            currentPayload: current
              ? await latestEntityPayload(
                  transaction,
                  userId,
                  operation.entityType,
                  operation.entityId,
                )
              : null,
            currentVersion: expectedVersion.toString(),
          },
        };
      }

      const newVersion = expectedVersion + BigInt(1);
      if (operation.action === "upsert") {
        payload = await resolveEntityPayload(transaction, userId, operation.entityType, payload, operation.entityId);
        await validateEntityTransition(
          transaction,
          userId,
          operation.entityType,
          operation.entityId,
          payload,
        );
        await upsertEntity(
          transaction,
          userId,
          operation.entityType,
          operation.entityId,
          payload,
          newVersion,
        );
      } else {
        await tombstoneEntity(
          transaction,
          userId,
          operation.entityType,
          operation.entityId,
          newVersion,
        );
      }

      const sequence = state.nextSequence;
      await transaction.insert(syncChanges).values({
        userId,
        sequence,
        entityType: operation.entityType,
        entityId: operation.entityId,
        entityVersion: newVersion,
        operation: operation.action,
        payload: operation.action === "upsert" ? asJsonValue(payload) : null,
      });
      await transaction
        .update(syncState)
        .set({ nextSequence: sequence + BigInt(1), updatedAt: new Date() })
        .where(eq(syncState.userId, userId));

      const result = {
        entityId: operation.entityId,
        entityType: operation.entityType,
        operation: operation.action,
        sequence: sequence.toString(),
        version: newVersion.toString(),
      };
      await transaction.insert(operationReceipts).values({
        userId,
        operationId: operation.operationId,
        requestHash,
        result: result as JsonObject,
      });

      return { operationId: operation.operationId, status: "applied" as const, ...result };
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return rejected(operation.operationId, error.code, error.message, error.details);
    }
    const code = postgresCode(error);
    if (code === "23503" || code === "23505" || code === "23514") {
      return rejected(
        operation.operationId,
        "DOMAIN_CONSTRAINT",
        "The operation conflicts with a domain rule",
      );
    }
    throw error;
  }
}

export async function pushOperations(userId: string, input: PushInput) {
  const results = [];
  for (const operation of input.operations) {
    results.push(await applyOperation(userId, operation));
  }
  return { schemaVersion: 1, results };
}

function snapshotItem(
  entityId: string,
  version: bigint,
  updatedAt: Date,
  payload: JsonValue,
): SnapshotItem {
  return {
    entityId,
    payload,
    updatedAt: updatedAt.toISOString(),
    version: version.toString(),
  };
}

function json(value: unknown): JsonValue {
  return value as JsonValue;
}

export async function bootstrap(userId: string) {
  const database = getDatabase();
  return database.transaction(
    async (transaction) => {
      // Legacy bootstrap is one atomic response, not an unbounded export. Check
      // size inside the same repeatable-read snapshot before fetching JSON rows.
      // No data is deleted/truncated; large accounts must use paginated history.
      const tables = ["profiles", "training_preferences", "custom_programs", "user_exercises", "workout_sessions",
        "user_preferences", "place_favorites", "meal_entries", "social_drafts", "legacy_user_metadata"];
      const budget = await transaction.execute<{ records: number; bytes: string }>(sql.join(tables.map((table) => sql`
        SELECT count(*)::integer AS records, coalesce(sum(octet_length(row_to_json(s)::text)), 0)::text AS bytes
        FROM (SELECT * FROM ${sql.identifier(table)} WHERE user_id = ${userId} AND deleted_at IS NULL LIMIT 501) s
      `), sql` UNION ALL `));
      if (budget.rows.some((row) => row.records > 500) || budget.rows.reduce((total, row) => total + Number(row.bytes), 0) > 1500000) {
        throw new ApiError(413, "BOOTSTRAP_LIMIT", "This account exceeds the single-response bootstrap limit; use paginated history or contact support");
      }
      const [state] = await transaction
        .select({ epoch: syncState.epoch, nextSequence: syncState.nextSequence })
        .from(syncState)
        .where(eq(syncState.userId, userId));
      if (!state) throw new Error("Sync state was not initialized");

      const profileRows = await transaction
        .select()
        .from(profiles)
        .where(and(eq(profiles.userId, userId), isNull(profiles.deletedAt)));
      const trainingRows = await transaction
        .select()
        .from(trainingPreferences)
        .where(
          and(
            eq(trainingPreferences.userId, userId),
            isNull(trainingPreferences.deletedAt),
          ),
        );
      const programRows = await transaction
        .select()
        .from(customPrograms)
        .where(and(eq(customPrograms.userId, userId), isNull(customPrograms.deletedAt)));
      const exerciseRows = await transaction
        .select()
        .from(userExercises)
        .where(and(eq(userExercises.userId, userId), isNull(userExercises.deletedAt)));
      const workoutRows = await transaction
        .select()
        .from(workoutSessions)
        .where(and(eq(workoutSessions.userId, userId), isNull(workoutSessions.deletedAt)));
      const preferenceRows = await transaction
        .select()
        .from(userPreferences)
        .where(
          and(eq(userPreferences.userId, userId), isNull(userPreferences.deletedAt)),
        );
      const favoriteRows = await transaction
        .select()
        .from(placeFavorites)
        .where(and(eq(placeFavorites.userId, userId), isNull(placeFavorites.deletedAt)));
      const mealRows = await transaction
        .select()
        .from(mealEntries)
        .where(and(eq(mealEntries.userId, userId), isNull(mealEntries.deletedAt)));
      const draftRows = await transaction
        .select()
        .from(socialDrafts)
        .where(and(eq(socialDrafts.userId, userId), isNull(socialDrafts.deletedAt)));
      const legacyRows = await transaction
        .select()
        .from(legacyUserMetadata)
        .where(
          and(eq(legacyUserMetadata.userId, userId), isNull(legacyUserMetadata.deletedAt)),
        );

      const entities: Record<EntityType, SnapshotItem[]> = {
        profile: profileRows.map((row) =>
          snapshotItem("profile", row.version, row.updatedAt, json({
            displayName: row.displayName,
            ageYears: row.ageYears,
            weightKg: row.weightKg,
            heightCm: row.heightCm,
            formulaSex: row.formulaSex,
            gender: row.gender,
            trainingContext: row.trainingContext,
            goal: row.goal,
            motivationReason: row.motivationReason,
            motivationEnabled: row.motivationEnabled,
            dailyActivity: row.dailyActivity,
            trainingFrequency: row.trainingFrequency,
            focus: row.focus,
            programSource: row.programSource,
            sessionMinutes: row.sessionMinutes,
            setupCompleted: row.setupCompleted,
            trainingLevel: row.trainingLevel,
            exerciseCapabilities: row.exerciseCapabilities,
            excludedExerciseIds: row.excludedExerciseIds,
          })),
        ),
        training_preferences: trainingRows.map((row) =>
          snapshotItem("training_preferences", row.version, row.updatedAt, json({
            mode: row.mode,
            equipment: row.equipment,
            noEquipment: row.noEquipment,
          })),
        ),
        custom_program: programRows.map((row) =>
          snapshotItem(row.id, row.version, row.updatedAt, json({
            mode: row.mode,
            name: row.name,
            durationMinutes: row.durationMinutes,
            weekday: row.weekday,
            exercisePrescriptions: row.exercisePrescriptions,
          })),
        ),
        user_exercise: exerciseRows.map((row) =>
          snapshotItem(row.id, row.version, row.updatedAt, json({
            mode: row.mode,
            name: row.name,
            defaultSets: row.defaultSets,
            defaultReps: row.defaultReps,
          })),
        ),
        workout_session: workoutRows.map((row) =>
          snapshotItem(row.id, row.version, row.updatedAt, json({
            planId: row.planId,
            mode: row.mode,
            status: row.status,
            startedAt: row.startedAt.toISOString(),
            finishedAt: row.finishedAt?.toISOString() ?? null,
            recordedOn: row.recordedOn,
            exerciseSnapshot: row.exerciseSnapshot,
            setLog: row.setLog,
            legacyMetadata: row.legacyMetadata,
          })),
        ),
        user_preferences: preferenceRows.map((row) =>
          snapshotItem("user_preferences", row.version, row.updatedAt, json({
            budgetRupiah: row.budgetRupiah,
            budgetIsManual: row.budgetIsManual,
            placesArea: row.placesArea,
          })),
        ),
        place_favorite: favoriteRows.map((row) =>
          snapshotItem(row.placeId, row.version, row.updatedAt, {}),
        ),
        meal_entry: mealRows.map((row) =>
          snapshotItem(row.id, row.version, row.updatedAt, json({
            note: row.note,
            menuName: row.menuName,
            samplePriceRupiah: row.samplePriceRupiah,
            snapshot: row.snapshot,
            catalogId: row.catalogId,
            servings: row.servings,
            consumedAt: row.consumedAt?.toISOString() ?? null,
            recordedOn: row.recordedOn,
            mealType: row.mealType,
            nutrition: row.nutritionPerServing,
          })),
        ),
        social_draft: draftRows.map((row) =>
          snapshotItem(row.id, row.version, row.updatedAt, json({
            body: row.body,
            metadata: row.metadata,
          })),
        ),
        legacy_user_metadata: legacyRows.map((row) =>
          snapshotItem("legacy_user_metadata", row.version, row.updatedAt, json({
            joinedIds: row.joinedIds,
            metadata: row.metadata,
          })),
        ),
      };

      return {
        schemaVersion: 1,
        cursor: encodeCursor({
          epoch: state.epoch,
          sequence: (state.nextSequence - BigInt(1)).toString(),
          userId,
        }),
        entities,
      };
    },
    { accessMode: "read only", isolationLevel: "repeatable read" },
  );
}

export async function pullChanges(userId: string, cursor: string, limit: number) {
  const decoded = decodeCursor(cursor, userId);
  const database = getDatabase();
  const [state] = await database
    .select({ epoch: syncState.epoch })
    .from(syncState)
    .where(eq(syncState.userId, userId));
  if (!state) throw new Error("Sync state was not initialized");
  if (state.epoch !== decoded.epoch) {
    throw conflict("CURSOR_EXPIRED", "The sync cursor is no longer valid; bootstrap again");
  }

  const fromSequence = BigInt(decoded.sequence);
  const rows = await database
    .select()
    .from(syncChanges)
    .where(and(eq(syncChanges.userId, userId), gt(syncChanges.sequence, fromSequence)))
    .orderBy(asc(syncChanges.sequence))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const lastSequence = page.at(-1)?.sequence ?? fromSequence;

  return {
    schemaVersion: 1,
    changes: page.map((row) => ({
      entityId: row.entityId,
      entityType: row.entityType,
      operation: row.operation,
      payload: row.payload,
      sequence: row.sequence.toString(),
      version: row.entityVersion.toString(),
    })),
    hasMore,
    nextCursor: encodeCursor({
      epoch: state.epoch,
      sequence: lastSequence.toString(),
      userId,
    }),
  };
}
