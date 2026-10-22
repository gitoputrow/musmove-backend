import { and, desc, eq, sql } from "drizzle-orm";

import type { Database } from "@/src/db/client";
import {
  customPrograms,
  legacyUserMetadata,
  mealEntries,
  placeFavorites,
  profiles,
  socialDrafts,
  syncChanges,
  trainingPreferences,
  userExercises,
  userPreferences,
  workoutSessions,
} from "@/src/db/schema";
import type {
  ExercisePrescription,
  JsonObject,
  JsonValue,
  WorkoutSetLog,
} from "@/src/db/schema";
import { badRequest } from "@/src/lib/api-error";
import { mealTotals, resolveMealPayload } from "@/src/modules/meals/resolve";
import { storeNutritionEstimate } from "@/src/modules/nutrition/storage";
import { resolveFocusFields } from "@/src/modules/programs/focus";

import { entityPayloadSchemas, type EntityType } from "./dto";

export type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

interface EntityVersion {
  deletedAt: Date | null;
  version: bigint;
}

interface StorageDescriptor {
  idColumn: "id" | "place_id" | "user_id";
  singletonId?: string;
  table: string;
}

const storage: Record<EntityType, StorageDescriptor> = {
  profile: { idColumn: "user_id", singletonId: "profile", table: "profiles" },
  training_preferences: {
    idColumn: "user_id",
    singletonId: "training_preferences",
    table: "training_preferences",
  },
  custom_program: { idColumn: "id", table: "custom_programs" },
  user_exercise: { idColumn: "id", table: "user_exercises" },
  workout_session: { idColumn: "id", table: "workout_sessions" },
  user_preferences: {
    idColumn: "user_id",
    singletonId: "user_preferences",
    table: "user_preferences",
  },
  place_favorite: { idColumn: "place_id", table: "place_favorites" },
  meal_entry: { idColumn: "id", table: "meal_entries" },
  social_draft: { idColumn: "id", table: "social_drafts" },
  legacy_user_metadata: {
    idColumn: "user_id",
    singletonId: "legacy_user_metadata",
    table: "legacy_user_metadata",
  },
};

function descriptor(entityType: EntityType, entityId: string) {
  const value = storage[entityType];
  if (value.singletonId && entityId !== value.singletonId) {
    throw badRequest(
      "INVALID_ENTITY_ID",
      `${entityType} must use entityId '${value.singletonId}'`,
    );
  }
  return value;
}

export async function readEntityVersion(
  transaction: DatabaseTransaction,
  userId: string,
  entityType: EntityType,
  entityId: string,
): Promise<EntityVersion | null> {
  const value = descriptor(entityType, entityId);
  const idFilter =
    value.idColumn === "user_id"
      ? sql`true`
      : sql`${sql.identifier(value.idColumn)} = ${entityId}`;
  const result = await transaction.execute<{
    deleted_at: Date | null;
    version: bigint | string;
  }>(sql`
    select version, deleted_at
      from ${sql.identifier(value.table)}
     where user_id = ${userId} and ${idFilter}
     for update
  `);
  const row = result.rows[0];
  return row ? { deletedAt: row.deleted_at, version: BigInt(row.version) } : null;
}

export async function latestEntityPayload(
  transaction: DatabaseTransaction,
  userId: string,
  entityType: EntityType,
  entityId: string,
) {
  const [change] = await transaction
    .select({ payload: syncChanges.payload })
    .from(syncChanges)
    .where(
      and(
        eq(syncChanges.userId, userId),
        eq(syncChanges.entityType, entityType),
        eq(syncChanges.entityId, entityId),
      ),
    )
    .orderBy(desc(syncChanges.sequence))
    .limit(1);
  return change?.payload ?? null;
}

export async function tombstoneEntity(
  transaction: DatabaseTransaction,
  userId: string,
  entityType: EntityType,
  entityId: string,
  version: bigint,
) {
  const value = descriptor(entityType, entityId);
  const idFilter =
    value.idColumn === "user_id"
      ? sql`true`
      : sql`${sql.identifier(value.idColumn)} = ${entityId}`;
  await transaction.execute(sql`
    update ${sql.identifier(value.table)}
       set version = ${version}, updated_at = now(), deleted_at = now()
     where user_id = ${userId} and ${idFilter}
  `);
}

export async function validateEntityTransition(
  transaction: DatabaseTransaction,
  userId: string,
  entityType: EntityType,
  entityId: string,
  rawPayload: unknown,
) {
  if (entityType === "user_exercise") {
    const payload = entityPayloadSchemas.user_exercise.parse(rawPayload);
    const [current] = await transaction
      .select({ mode: userExercises.mode })
      .from(userExercises)
      .where(and(eq(userExercises.userId, userId), eq(userExercises.id, entityId)))
      .limit(1);
    if (current && current.mode !== payload.mode) {
      throw badRequest(
        "IMMUTABLE_FIELD",
        "The mode of an existing user exercise cannot be changed",
      );
    }
  }

  if (entityType === "workout_session") {
    entityPayloadSchemas.workout_session.parse(rawPayload);
    const [current] = await transaction
      .select({ status: workoutSessions.status })
      .from(workoutSessions)
      .where(and(eq(workoutSessions.userId, userId), eq(workoutSessions.id, entityId)))
      .limit(1);
    if (current && current.status !== "active") {
      throw badRequest(
        "WORKOUT_FINALIZED",
        "A completed or aborted workout cannot be reopened or edited",
      );
    }
  }
}

export async function upsertEntity(
  transaction: DatabaseTransaction,
  userId: string,
  entityType: EntityType,
  entityId: string,
  rawPayload: unknown,
  version: bigint,
) {
  descriptor(entityType, entityId);
  const now = new Date();

  switch (entityType) {
    case "profile": {
      const payload = entityPayloadSchemas.profile.parse(rawPayload);
      const focus = resolveFocusFields(payload);
      await transaction
        .insert(profiles)
        .values({
          userId,
          displayName: payload.displayName ?? null,
          ageYears: payload.ageYears ?? null,
          weightKg: payload.weightKg ?? null,
          heightCm: payload.heightCm ?? null,
          formulaSex: payload.formulaSex ?? null,
          gender: payload.gender ?? null,
          trainingContext: payload.trainingContext ?? null,
          goal: payload.goal ?? null,
          motivationReason: payload.motivationReason ?? null,
          motivationEnabled: payload.motivationEnabled,
          dailyActivity: payload.dailyActivity ?? null,
          trainingFrequency: payload.trainingFrequency ?? null,
          ...focus,
          programSource: payload.programSource ?? null,
          sessionMinutes: payload.sessionMinutes ?? null,
          setupCompleted: payload.setupCompleted,
          trainingLevel: payload.trainingLevel ?? null,
          exerciseCapabilities: payload.exerciseCapabilities ?? null,
          excludedExerciseIds: payload.excludedExerciseIds ?? null,
          version,
        })
        .onConflictDoUpdate({
          target: profiles.userId,
          set: {
            displayName: payload.displayName ?? null,
            ageYears: payload.ageYears ?? null,
            weightKg: payload.weightKg ?? null,
            heightCm: payload.heightCm ?? null,
            formulaSex: payload.formulaSex ?? null,
            ...(payload.gender === undefined ? {} : { gender: payload.gender }),
            ...(payload.trainingContext === undefined ? {} : { trainingContext: payload.trainingContext }),
            goal: payload.goal ?? null,
            motivationReason: payload.motivationReason ?? null,
            motivationEnabled: payload.motivationEnabled,
            dailyActivity: payload.dailyActivity ?? null,
            trainingFrequency: payload.trainingFrequency ?? null,
            ...focus,
            programSource: payload.programSource ?? null,
            sessionMinutes: payload.sessionMinutes ?? null,
            setupCompleted: payload.setupCompleted,
            ...(payload.trainingLevel === undefined ? {} : { trainingLevel: payload.trainingLevel }),
            ...(payload.exerciseCapabilities === undefined ? {} : { exerciseCapabilities: payload.exerciseCapabilities }),
            ...(payload.excludedExerciseIds === undefined ? {} : { excludedExerciseIds: payload.excludedExerciseIds }),
            version,
            updatedAt: now,
            deletedAt: null,
          },
        });
      await storeNutritionEstimate(transaction, userId);
      break;
    }
    case "training_preferences": {
      const payload = entityPayloadSchemas.training_preferences.parse(rawPayload);
      await transaction
        .insert(trainingPreferences)
        .values({ userId, ...payload, version })
        .onConflictDoUpdate({
          target: trainingPreferences.userId,
          set: { ...payload, version, updatedAt: now, deletedAt: null },
        });
      break;
    }
    case "custom_program": {
      const payload = entityPayloadSchemas.custom_program.parse(rawPayload);
      const exercisePrescriptions =
        payload.exercisePrescriptions as unknown as ExercisePrescription[];
      await transaction
        .insert(customPrograms)
        .values({
          userId,
          id: entityId,
          ...payload,
          exercisePrescriptions,
          version,
        })
        .onConflictDoUpdate({
          target: [customPrograms.userId, customPrograms.id],
          set: {
            ...payload,
            exercisePrescriptions,
            version,
            updatedAt: now,
            deletedAt: null,
          },
        });
      break;
    }
    case "user_exercise": {
      const payload = entityPayloadSchemas.user_exercise.parse(rawPayload);
      await transaction
        .insert(userExercises)
        .values({ userId, id: entityId, ...payload, version })
        .onConflictDoUpdate({
          target: [userExercises.userId, userExercises.id],
          set: { ...payload, version, updatedAt: now, deletedAt: null },
        });
      break;
    }
    case "workout_session": {
      const payload = entityPayloadSchemas.workout_session.parse(rawPayload);
      const exerciseSnapshot =
        payload.exerciseSnapshot as unknown as ExercisePrescription[];
      const setLog = payload.setLog as unknown as WorkoutSetLog[];
      const legacyMetadata = payload.legacyMetadata as JsonObject | null;
      const data = {
        planId: payload.planId,
        mode: payload.mode,
        status: payload.status,
        startedAt: new Date(payload.startedAt),
        finishedAt: payload.finishedAt ? new Date(payload.finishedAt) : null,
        recordedOn: payload.recordedOn,
        exerciseSnapshot,
        setLog,
        legacyMetadata,
      };
      await transaction
        .insert(workoutSessions)
        .values({ userId, id: entityId, ...data, version })
        .onConflictDoUpdate({
          target: [workoutSessions.userId, workoutSessions.id],
          set: { ...data, version, updatedAt: now, deletedAt: null },
        });
      break;
    }
    case "user_preferences": {
      const payload = entityPayloadSchemas.user_preferences.parse(rawPayload);
      await transaction
        .insert(userPreferences)
        .values({ userId, ...payload, version })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: { ...payload, version, updatedAt: now, deletedAt: null },
        });
      break;
    }
    case "place_favorite": {
      entityPayloadSchemas.place_favorite.parse(rawPayload);
      await transaction
        .insert(placeFavorites)
        .values({ userId, placeId: entityId, version })
        .onConflictDoUpdate({
          target: [placeFavorites.userId, placeFavorites.placeId],
          set: { version, updatedAt: now, deletedAt: null },
        });
      break;
    }
    case "meal_entry": {
      const payload = entityPayloadSchemas.meal_entry.parse(rawPayload);
      const { nutrition, consumedAt, ...rest } = payload;
      const data = {
        ...rest, catalogId: payload.catalogId ?? null, servings: payload.servings ?? null,
        consumedAt: consumedAt ? new Date(consumedAt) : null, recordedOn: payload.recordedOn ?? null,
        mealType: payload.mealType ?? null, nutritionPerServing: nutrition ?? null,
        caloriesKcal: nutrition && payload.servings ? mealTotals(nutrition, payload.servings).caloriesKcal : null,
        proteinGrams: nutrition && payload.servings ? mealTotals(nutrition, payload.servings).proteinGrams : null,
        snapshot: payload.snapshot as JsonObject,
      };
      await transaction
        .insert(mealEntries)
        .values({
          userId,
          id: entityId,
          ...data,
          version,
        })
        .onConflictDoUpdate({
          target: [mealEntries.userId, mealEntries.id],
          set: {
            ...data,
            version,
            updatedAt: now,
            deletedAt: null,
          },
        });
      break;
    }
    case "social_draft": {
      const payload = entityPayloadSchemas.social_draft.parse(rawPayload);
      await transaction
        .insert(socialDrafts)
        .values({
          userId,
          id: entityId,
          ...payload,
          metadata: payload.metadata as JsonObject | null,
          version,
        })
        .onConflictDoUpdate({
          target: [socialDrafts.userId, socialDrafts.id],
          set: {
            ...payload,
            metadata: payload.metadata as JsonObject | null,
            version,
            updatedAt: now,
            deletedAt: null,
          },
        });
      break;
    }
    case "legacy_user_metadata": {
      const payload = entityPayloadSchemas.legacy_user_metadata.parse(rawPayload);
      await transaction
        .insert(legacyUserMetadata)
        .values({
          userId,
          ...payload,
          metadata: payload.metadata as JsonObject,
          version,
        })
        .onConflictDoUpdate({
          target: legacyUserMetadata.userId,
          set: {
            ...payload,
            metadata: payload.metadata as JsonObject,
            version,
            updatedAt: now,
            deletedAt: null,
          },
        });
      break;
    }
  }
}

export async function resolveEntityPayload(
  transaction: DatabaseTransaction,
  userId: string,
  entityType: EntityType,
  payload: unknown,
  entityId?: string,
) {
  if (entityType === "meal_entry") {
    if (!entityId) throw new Error("Meal resolution requires an entity ID");
    return resolveMealPayload(transaction, userId, entityId, entityPayloadSchemas.meal_entry.parse(payload));
  }
  if (entityType !== "profile") return payload;
  const parsed = entityPayloadSchemas.profile.parse(payload);
  const [current] = await transaction.select({
    focus: profiles.focus,
    focusAreas: profiles.focusAreas,
    deletedAt: profiles.deletedAt,
    trainingLevel: profiles.trainingLevel,
    exerciseCapabilities: profiles.exerciseCapabilities,
    excludedExerciseIds: profiles.excludedExerciseIds,
    gender: profiles.gender,
    trainingContext: profiles.trainingContext,
  }).from(profiles).where(eq(profiles.userId, userId)).limit(1);
  // Older clients omit new fields. Publish the resolved values in the same
  // change log payload as the persisted row so pull/bootstrap cannot diverge.
  return {
    ...parsed,
    ...resolveFocusFields(parsed, current && !current.deletedAt ? current : {}),
    trainingLevel: parsed.trainingLevel === undefined ? current?.trainingLevel ?? null : parsed.trainingLevel,
    exerciseCapabilities: parsed.exerciseCapabilities === undefined ? current?.exerciseCapabilities ?? null : parsed.exerciseCapabilities,
    excludedExerciseIds: parsed.excludedExerciseIds === undefined ? current?.excludedExerciseIds ?? null : parsed.excludedExerciseIds,
    gender: parsed.gender === undefined ? current?.gender ?? null : parsed.gender,
    trainingContext: parsed.trainingContext === undefined ? current?.trainingContext ?? null :
      parsed.trainingContext === null ? null : { ...current?.trainingContext, ...parsed.trainingContext },
  };
}

export function asJsonValue(payload: unknown): JsonValue {
  return payload as JsonValue;
}
