import { z } from "zod";
import { focusAreasSchema, validateFocusPair } from "@/src/modules/programs/focus";
import { assertSafeJson } from "@/src/lib/body";

export const boundedJsonPayload = z.unknown().superRefine((value, context) => {
  try { assertSafeJson(value); }
  catch { context.addIssue({ code: "custom", message: "Payload must be bounded JSON (64 KiB, depth 32) without reserved keys" }); }
});

const nullableString = (max: number) => z.string().trim().min(1).max(max).nullable();
const nullableFiniteNumber = z.number().finite().nullable();
const modeSchema = z.enum(["gym", "calisthenics"]);
const safeDisplayString = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(
    (value) =>
      !Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      }),
    { message: "Control characters are not allowed" },
  );
const decimalVersionSchema = z
  .union([z.string().max(19).regex(/^(0|[1-9][0-9]*)$/), z.number().int().safe().nonnegative()])
  .transform((value) => value.toString())
  .refine((value) => BigInt(value) <= BigInt("9223372036854775807"), {
    message: "Version exceeds the supported range",
  });

export const trainingContextSchema = z.object({
  pregnancyStatus: z.enum(["not_applicable", "not_pregnant", "pregnant", "postpartum", "prefer_not_to_say"]).nullable().optional(),
  healthStatus: z.enum(["no_known_restrictions", "needs_professional_guidance", "prefer_not_to_say"]).nullable().optional(),
  painAreas: z.array(z.enum(["shoulder", "elbow", "wrist", "back", "hip", "knee", "ankle"])).max(7).optional(),
  mobilityLimitations: z.array(z.enum(["floor_transfer", "overhead_reach", "deep_knee_bend"])).max(3).optional(),
  balanceConfidence: z.enum(["stable", "needs_support"]).nullable().optional(),
  recoveryStatus: z.enum(["recovered", "tired", "very_tired"]).nullable().optional(),
  trainingBreakWeeks: z.number().int().min(0).max(520).nullable().optional(),
  equipmentHeightLimits: z.array(z.object({
    equipment: z.string().trim().min(1).max(80),
    minHeightCm: z.number().finite().min(1).max(300),
    maxHeightCm: z.number().finite().min(1).max(300),
  }).strict().refine((value) => value.minHeightCm <= value.maxHeightCm, { message: "Invalid equipment height range" }))
    .max(50).refine((items) => new Set(items.map((item) => item.equipment)).size === items.length, { message: "Duplicate equipment height range" }).optional(),
}).strict();

export const exerciseSchema = z
  .object({
    enLabel: z.string().trim().min(1).max(80),
    id: z.string().trim().min(1).max(255),
    idLabel: z.string().trim().min(1).max(80),
    reps: z.number().int().min(1).max(100),
    requirements: z.array(z.array(z.string().trim().min(1).max(80)).max(20)).min(1).max(20),
    sets: z.number().int().min(1).max(10),
    targetWeightKg: z.number().finite().min(0).max(500).nullable(),
  })
  .strict();

export const workoutSetLogSchema = z
  .object({
    completed: z.boolean(),
    exerciseId: z.string().trim().min(1).max(255),
    reps: z.number().int().min(0).max(100).nullable(),
    setNumber: z.number().int().min(1).max(10),
    weightKg: z.number().finite().min(0).max(500).nullable(),
  })
  .strict();

export const entityPayloadSchemas = {
  profile: z
    .object({
      ageYears: z.number().int().min(1).max(150).nullable().optional(),
      dailyActivity: z.enum(["light", "moderate", "vigorous"]).nullable().optional(),
      displayName: nullableString(80).optional(),
      focus: nullableString(50).optional(),
      focusAreas: focusAreasSchema.optional(),
      formulaSex: z.enum(["male", "female"]).nullable().optional(),
      gender: z.enum(["male", "female", "non_binary", "self_described", "prefer_not_to_say"]).nullable().optional(),
      trainingContext: trainingContextSchema.nullable().optional(),
      goal: nullableString(50).optional(),
      heightCm: z.number().finite().positive().max(999.99).nullable().optional(),
      motivationEnabled: z.boolean().default(true),
      motivationReason: nullableString(80).optional(),
      programSource: z.enum(["app", "custom"]).nullable().optional(),
      sessionMinutes: z.number().int().min(10).max(180).nullable().optional(),
      setupCompleted: z.boolean().default(false),
      trainingFrequency: z.number().int().min(1).max(7).nullable().optional(),
      trainingLevel: z.enum(["beginner", "intermediate", "advanced"]).nullable().optional(),
      exerciseCapabilities: z.array(z.object({
        exerciseId: z.string().trim().min(1).max(255),
        mode: modeSchema,
        maxReps: z.number().int().min(0).max(100),
        weightKg: z.number().finite().min(0).max(500).nullable(),
        bodyweightKg: z.number().finite().positive().max(9999.99).nullable().optional(),
      }).strict()).max(100).refine((items) => new Set(items.map((item) => `${item.mode}:${item.exerciseId}`)).size === items.length, { message: "Duplicate exercise capability" }).nullable().optional(),
      excludedExerciseIds: z.array(z.string().trim().min(1).max(255)).max(100).nullable().optional(),
      weightKg: z.number().finite().positive().max(9999.99).nullable().optional(),
    })
    .strict(),
  training_preferences: z
    .object({
      equipment: z.array(z.string().trim().min(1).max(80)).max(50),
      mode: modeSchema,
      noEquipment: z.boolean(),
    })
    .strict()
    .refine(
      (value) =>
        (value.noEquipment && value.equipment.length === 0) ||
        (!value.noEquipment && value.equipment.length > 0),
      { message: "Choose equipment or explicitly select no equipment" },
    ),
  custom_program: z
    .object({
      durationMinutes: z.number().int().min(10).max(180),
      exercisePrescriptions: z.array(exerciseSchema).min(1).max(12),
      mode: modeSchema,
      name: z.string().trim().min(1).max(60),
      weekday: z.number().int().min(1).max(7).nullable(),
    })
    .strict()
    .refine(
      (value) =>
        new Set(value.exercisePrescriptions.map((exercise) => exercise.id)).size ===
        value.exercisePrescriptions.length,
      { message: "Exercise IDs must be unique within a program" },
    ),
  user_exercise: z
    .object({
      defaultReps: z.number().int().min(1).max(100),
      defaultSets: z.number().int().min(1).max(10),
      mode: modeSchema,
      name: safeDisplayString,
    })
    .strict(),
  workout_session: z
    .object({
      exerciseSnapshot: z.array(exerciseSchema).min(1).max(12),
      finishedAt: z.iso.datetime({ offset: true }).nullable(),
      legacyMetadata: z.record(z.string(), z.unknown()).nullable(),
      mode: modeSchema,
      planId: z.string().trim().min(1).max(255),
      recordedOn: z.iso.date().nullable(),
      setLog: z.array(workoutSetLogSchema).max(120),
      startedAt: z.iso.datetime({ offset: true }),
      status: z.enum(["active", "completed", "aborted"]),
    })
    .strict()
    .refine(
      (value) =>
        (value.status === "active" && value.finishedAt === null) ||
        (value.status !== "active" && value.finishedAt !== null),
      { message: "Active sessions cannot have finishedAt; final sessions require it" },
    )
    .refine(
      (value) =>
        new Set(value.exerciseSnapshot.map((exercise) => exercise.id)).size ===
        value.exerciseSnapshot.length,
      { message: "Exercise IDs must be unique within a workout snapshot" },
    )
    .refine(
      (value) => {
        const exercises = new Map(
          value.exerciseSnapshot.map((exercise) => [exercise.id, exercise.sets]),
        );
        const setKeys = new Set<string>();
        return value.setLog.every((entry) => {
          const key = `${entry.exerciseId}\u0000${entry.setNumber}`;
          const valid =
            exercises.has(entry.exerciseId) &&
            entry.setNumber <= (exercises.get(entry.exerciseId) ?? 0) &&
            !setKeys.has(key);
          setKeys.add(key);
          return valid;
        });
      },
      { message: "Set logs must uniquely reference a set in the exercise snapshot" },
    ),
  user_preferences: z
    .object({
      budgetIsManual: z.boolean(),
      budgetRupiah: z.number().int().positive().nullable(),
      placesArea: nullableString(120),
    })
    .strict(),
  place_favorite: z.object({}).strict(),
  meal_entry: z
    .object({
      menuName: nullableString(120),
      note: z.string().max(2000).nullable(),
      samplePriceRupiah: z.number().int().nonnegative().nullable(),
      snapshot: z.record(z.string(), z.unknown()),
      catalogId: nullableString(255).optional(),
      servings: z.number().finite().min(0.01).max(20).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, { message: "Use at most two decimal places" }).nullable().optional(),
      consumedAt: z.iso.datetime({ offset: true }).nullable().optional(),
      recordedOn: z.iso.date().nullable().optional(),
      mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).nullable().optional(),
      nutrition: z.object({
        caloriesKcal: z.number().finite().min(0).max(10000),
        proteinGrams: z.number().finite().min(0).max(1000),
        carbohydrateGrams: z.number().finite().min(0).max(1000).nullable().optional(),
        fatGrams: z.number().finite().min(0).max(1000).nullable().optional(),
        fiberGrams: z.number().finite().min(0).max(1000).nullable().optional(),
        sodiumMg: z.number().finite().min(0).max(100000).nullable().optional(),
      }).strict().nullable().optional(),
    })
    .strict(),
  social_draft: z
    .object({
      body: z.string().trim().min(1).max(2000),
      metadata: z.record(z.string(), z.unknown()).nullable(),
    })
    .strict(),
  legacy_user_metadata: z
    .object({
      joinedIds: z.array(z.string().trim().min(1).max(255)).max(500),
      metadata: z.record(z.string(), z.unknown()),
    })
    .strict(),
} as const;

export const entityTypeSchema = z.enum([
  "profile",
  "training_preferences",
  "custom_program",
  "user_exercise",
  "workout_session",
  "user_preferences",
  "place_favorite",
  "meal_entry",
  "social_draft",
  "legacy_user_metadata",
]);

export type EntityType = z.infer<typeof entityTypeSchema>;

export const syncOperationSchema = z
  .object({
    action: z.enum(["upsert", "delete"]),
    baseVersion: decimalVersionSchema,
    entityId: z.string().trim().min(1).max(255),
    entityType: entityTypeSchema,
    operationId: z.uuid(),
    payload: boundedJsonPayload.optional(),
  })
  .strict();

export const syncPushSchema = z
  .object({
    deviceId: z.string().trim().min(1).max(255),
    operations: z.array(syncOperationSchema).min(1).max(50),
    schemaVersion: z.literal(1),
  })
  .strict();

export type SyncOperation = z.infer<typeof syncOperationSchema>;

export function parseEntityPayload(entityType: EntityType, payload: unknown) {
  if (entityType === "profile") return entityPayloadSchemas.profile.superRefine((profile, ctx) => {
    validateFocusPair(profile, ctx);
    if (profile.programSource === "app" && profile.focusAreas?.length === 0) {
      ctx.addIssue({ code: "custom", path: ["focusAreas"], message: "Choose focus areas for app-generated programs" });
    }
  }).parse(payload);
  return entityPayloadSchemas[entityType].parse(payload);
}

export const pullQuerySchema = z.object({
  cursor: z.string().min(1).max(2048),
  limit: z.coerce.number().int().min(1).max(200).default(100),
}).strict();

export const nullableNumber = nullableFiniteNumber;
