import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDatabase } from "@/src/db/client";
import { equipmentCatalog, operationReceipts, profiles, syncChanges, syncState, trainingPreferences, users } from "@/src/db/schema";
import type { JsonObject } from "@/src/db/schema";
import { ApiError, badRequest, conflict, forbidden } from "@/src/lib/api-error";
import { readNutritionTargets } from "@/src/modules/nutrition/storage";
import { entityPayloadSchemas } from "@/src/modules/sync/dto";
import { canonicalRequestHash } from "@/src/modules/sync/encoding";
import { asJsonValue, upsertEntity, type DatabaseTransaction } from "@/src/modules/sync/entities";
import { lockSyncState } from "@/src/modules/sync/service";
import type { CompleteOnboardingInput } from "./dto";

const KIND = "onboarding.complete.v1";
const MAX_VERSION = BigInt("9223372036854775807");

async function readRows(transaction: DatabaseTransaction, userId: string) {
  const [profile] = await transaction.select().from(profiles).where(eq(profiles.userId, userId));
  const [training] = await transaction.select().from(trainingPreferences).where(eq(trainingPreferences.userId, userId));
  return { profile, training };
}

function projectSetup({ profile, training }: Awaited<ReturnType<typeof readRows>>) {
  const profileLive = profile && !profile.deletedAt;
  const trainingLive = training && !training.deletedAt;
  // Preserve all existing completed accounts; do not infer completion from field completeness.
  return {
    setupCompleted: profileLive ? profile.setupCompleted : false,
    profile: profileLive ? (({ userId: _owner, deletedAt: _deleted, version, updatedAt, ...fields }) => {
      void _owner; void _deleted;
      return { ...fields, version: version.toString(), updatedAt: updatedAt.toISOString() };
    })(profile) : null,
    trainingPreferences: trainingLive ? {
      mode: training.mode, equipment: training.equipment, noEquipment: training.noEquipment,
      version: training.version.toString(), updatedAt: training.updatedAt.toISOString(),
    } : null,
    // Keep tombstone versions for explicit optimistic concurrency, even when DTO is null.
    versions: { profile: (profile?.version ?? BigInt(0)).toString(), trainingPreferences: (training?.version ?? BigInt(0)).toString() },
  };
}

export async function getAccountSetup(userId: string) {
  return getDatabase().transaction(async transaction => {
    const [account] = await transaction.select({ status: users.status }).from(users).where(eq(users.id, userId));
    if (!account || account.status !== "active") throw forbidden("ACCOUNT_INACTIVE", "The account is not active");
    return projectSetup(await readRows(transaction, userId));
  }, { accessMode: "read only", isolationLevel: "repeatable read" });
}

export async function completeOnboarding(userId: string, operationId: string, input: CompleteOnboardingInput) {
  const requestHash = canonicalRequestHash({ kind: KIND, input });
  return getDatabase().transaction(async transaction => {
    // Same account -> sync-state lock order as legacy sync; deletion blocks both paths.
    const state = await lockSyncState(transaction, userId);
    const [receipt] = await transaction.select().from(operationReceipts).where(and(
      eq(operationReceipts.userId, userId), eq(operationReceipts.operationId, operationId),
    ));
    if (receipt) {
      if (receipt.requestHash !== requestHash || receipt.result.kind !== KIND) {
        throw conflict("IDEMPOTENCY_KEY_REUSE", "This idempotency key was already used for different content or another operation");
      }
      return receipt.result.response as JsonObject;
    }
    const current = await readRows(transaction, userId);
    if (current.profile && !current.profile.deletedAt && current.profile.setupCompleted) {
      throw conflict("ONBOARDING_ALREADY_COMPLETED", "Setup is already complete; refresh /me instead of submitting again");
    }
    const versions = projectSetup(current).versions;
    if (input.baseVersions.profile !== versions.profile || input.baseVersions.trainingPreferences !== versions.trainingPreferences) {
      throw conflict("VERSION_CONFLICT", "Setup data changed; refresh /me before submitting again", { currentVersions: versions });
    }
    if (BigInt(versions.profile) >= MAX_VERSION || BigInt(versions.trainingPreferences) >= MAX_VERSION || state.nextSequence > MAX_VERSION - BigInt(2)) {
      throw conflict("VERSION_LIMIT", "The account requires operator assistance before further changes");
    }
    const selected = input.trainingPreferences;
    if (selected.equipment.length) {
      const available = await transaction.select({ id: equipmentCatalog.id }).from(equipmentCatalog).where(and(
        eq(equipmentCatalog.active, true), inArray(equipmentCatalog.id, selected.equipment),
        sql`${equipmentCatalog.modes} @> ARRAY[${selected.mode}]::text[]`,
      ));
      if (available.length !== selected.equipment.length) throw badRequest("EQUIPMENT_NOT_AVAILABLE_FOR_MODE", "Choose active catalog equipment supported by the selected training mode");
    }
    // Merge only explicit inputs; do not clear optional measurements, identity/context,
    // ability evidence, or exclusions omitted by this client's setup UI.
    const previous = current.profile && !current.profile.deletedAt ? projectSetup(current).profile : null;
    const { version: _version, updatedAt: _updated, ...previousFields } = previous ?? {};
    void _version; void _updated;
    const canonicalProfile = entityPayloadSchemas.profile.parse({
      displayName: null, weightKg: null, heightCm: null, formulaSex: null, gender: null,
      trainingLevel: null, exerciseCapabilities: null, excludedExerciseIds: null, focus: null,
      ...previousFields, ...input.profile, setupCompleted: true,
      // Merge only a LIVE profile's context; tombstones must not revive old data.
      trainingContext: input.profile.trainingContext === undefined ? previous?.trainingContext ?? null :
        input.profile.trainingContext === null ? null : { ...previous?.trainingContext, ...input.profile.trainingContext },
    });
    const profileVersion = BigInt(versions.profile) + BigInt(1);
    const trainingVersion = BigInt(versions.trainingPreferences) + BigInt(1);
    // upsertEntity also stores the nutrition snapshot from the effective profile,
    // in THIS transaction; missing optional inputs remain unavailable, not invented.
    await upsertEntity(transaction, userId, "profile", "profile", canonicalProfile, profileVersion);
    await upsertEntity(transaction, userId, "training_preferences", "training_preferences", selected, trainingVersion);
    const savedSetup = projectSetup(await readRows(transaction, userId));
    // Use persisted values (including numeric precision and explicit nulls), not
    // raw input, so old pull clients see exactly the same profile as /me.
    const { version: _savedVersion, updatedAt: _savedUpdated, ...savedProfile } = savedSetup.profile!;
    void _savedVersion; void _savedUpdated;
    await transaction.insert(syncChanges).values([
      { userId, sequence: state.nextSequence, entityType: "profile", entityId: "profile", entityVersion: profileVersion,
        operation: "upsert", payload: asJsonValue(savedProfile) },
      { userId, sequence: state.nextSequence + BigInt(1), entityType: "training_preferences", entityId: "training_preferences", entityVersion: trainingVersion,
        operation: "upsert", payload: asJsonValue(selected) },
    ]);
    await transaction.update(syncState).set({ nextSequence: state.nextSequence + BigInt(2), updatedAt: new Date() }).where(eq(syncState.userId, userId));
    const response = {
      operationId, ...savedSetup,
      nutritionTargets: await readNutritionTargets(transaction, userId),
    };
    // Save a bounded canonical response atomically. Never store credentials here.
    const jsonResponse = JSON.parse(JSON.stringify(response)) as JsonObject;
    if (Buffer.byteLength(JSON.stringify(jsonResponse)) > 128 * 1024) throw new ApiError(413, "RESPONSE_TOO_LARGE", "Setup response exceeds the supported size");
    await transaction.insert(operationReceipts).values({ userId, operationId, requestHash, result: { kind: KIND, response: jsonResponse } });
    return jsonResponse;
  });
}
