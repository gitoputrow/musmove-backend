import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  dailyActivityEnum,
  formulaSexEnum,
  programSourceEnum,
  trainingModeEnum,
  workoutStatusEnum,
  workoutModeEnum,
} from "./enums";
import { mutableColumns } from "./helpers";
import type {
  ExercisePrescription,
  WorkoutExercisePrescription,
  ExerciseCapability,
  TrainingContext,
  JsonObject,
  WorkoutSetLog,
} from "./types";
import { users } from "./users";
import type { MealNutrition } from "@/src/modules/meals/types";

export const profiles = pgTable(
  "profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 80 }),
    ageYears: smallint("age_years"),
    weightKg: numeric("weight_kg", {
      mode: "number",
      precision: 6,
      scale: 2,
    }),
    heightCm: numeric("height_cm", {
      mode: "number",
      precision: 5,
      scale: 2,
    }),
    formulaSex: formulaSexEnum("formula_sex"),
    gender: varchar("gender", { length: 30 }),
    trainingContext: jsonb("training_context").$type<TrainingContext>(),
    goal: varchar("goal", { length: 50 }),
    motivationReason: varchar("motivation_reason", { length: 80 }),
    motivationEnabled: boolean("motivation_enabled").notNull().default(true),
    dailyActivity: dailyActivityEnum("daily_activity"),
    trainingFrequency: smallint("training_frequency"),
    focus: varchar("focus", { length: 50 }),
    focusAreas: text("focus_areas").array().notNull().default(sql`'{}'::text[]`),
    programSource: programSourceEnum("program_source"),
    sessionMinutes: smallint("session_minutes"),
    setupCompleted: boolean("setup_completed").notNull().default(false),
    trainingLevel: varchar("training_level", { length: 20 }),
    exerciseCapabilities: jsonb("exercise_capabilities").$type<ExerciseCapability[]>(),
    excludedExerciseIds: text("excluded_exercise_ids").array(),
    ...mutableColumns(),
  },
  (table) => [
    check(
      "profiles_age_range",
      sql`${table.ageYears} is null or ${table.ageYears} between 1 and 150`,
    ),
    check(
      "profiles_weight_positive",
      sql`${table.weightKg} is null or ${table.weightKg} > 0`,
    ),
    check(
      "profiles_height_positive",
      sql`${table.heightCm} is null or ${table.heightCm} > 0`,
    ),
    check(
      "profiles_frequency_range",
      sql`${table.trainingFrequency} is null or ${table.trainingFrequency} between 1 and 7`,
    ),
    check(
      "profiles_session_minutes_range",
      sql`${table.sessionMinutes} is null or ${table.sessionMinutes} between 10 and 180`,
    ),
    check("profiles_version_positive", sql`${table.version} > 0`),
    check("profiles_focus_areas", sql`musmove_valid_focus_areas(${table.focusAreas})`),
    check("profiles_training_level", sql`${table.trainingLevel} is null or ${table.trainingLevel} in ('beginner', 'intermediate', 'advanced')`),
    check("profiles_capabilities_array", sql`${table.exerciseCapabilities} is null or jsonb_typeof(${table.exerciseCapabilities}) = 'array'`),
    check("profiles_gender", sql`${table.gender} is null or ${table.gender} in ('male', 'female', 'non_binary', 'self_described', 'prefer_not_to_say')`),
    check("profiles_training_context", sql`${table.trainingContext} is null or jsonb_typeof(${table.trainingContext}) = 'object'`),
  ],
);

export const trainingPreferences = pgTable(
  "training_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: trainingModeEnum("mode").notNull(),
    equipment: text("equipment")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    noEquipment: boolean("no_equipment").notNull().default(false),
    ...mutableColumns(),
  },
  (table) => [
    check(
      "training_preferences_equipment_choice",
      sql`(${table.noEquipment} and cardinality(${table.equipment}) = 0)
        or (not ${table.noEquipment} and cardinality(${table.equipment}) > 0)`,
    ),
    check("training_preferences_version_positive", sql`${table.version} > 0`),
  ],
);

export const customPrograms = pgTable(
  "custom_programs",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    id: varchar("id", { length: 255 }).notNull(),
    mode: trainingModeEnum("mode").notNull(),
    name: varchar("name", { length: 60 }).notNull(),
    durationMinutes: smallint("duration_minutes").notNull(),
    weekday: smallint("weekday"),
    exercisePrescriptions: jsonb("exercise_prescriptions")
      .$type<ExercisePrescription[]>()
      .notNull(),
    ...mutableColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    uniqueIndex("custom_programs_live_schedule_uidx")
      .on(table.userId, table.mode, table.weekday)
      .where(sql`${table.weekday} is not null and ${table.deletedAt} is null`),
    check("custom_programs_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check("custom_programs_name_not_blank", sql`length(trim(${table.name})) > 0`),
    check(
      "custom_programs_duration_range",
      sql`${table.durationMinutes} between 10 and 180`,
    ),
    check(
      "custom_programs_weekday_range",
      sql`${table.weekday} is null or ${table.weekday} between 1 and 7`,
    ),
    check(
      "custom_programs_exercise_count",
      sql`jsonb_typeof(${table.exercisePrescriptions}) = 'array'
        and jsonb_array_length(${table.exercisePrescriptions}) between 1 and 12`,
    ),
    check("custom_programs_version_positive", sql`${table.version} > 0`),
  ],
);

export const userExercises = pgTable(
  "user_exercises",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    id: varchar("id", { length: 255 }).notNull(),
    mode: trainingModeEnum("mode").notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    defaultSets: smallint("default_sets").notNull(),
    defaultReps: smallint("default_reps"),
    trackingType: text("tracking_type").$type<"repetitions" | "duration">().notNull().default("repetitions"),
    defaultDurationSeconds: integer("default_duration_seconds"),
    ...mutableColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    check("user_exercises_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check("user_exercises_name_not_blank", sql`length(trim(${table.name})) > 0`),
    check("user_exercises_sets_range", sql`${table.defaultSets} between 1 and 10`),
    check("user_exercises_reps_range", sql`${table.defaultReps} between 1 and 100`),
    check("user_exercises_version_positive", sql`${table.version} > 0`),
    check("user_exercises_measurement", sql`(${table.trackingType}='repetitions' and ${table.defaultReps} is not null and ${table.defaultDurationSeconds} is null) or (${table.trackingType}='duration' and ${table.defaultReps} is null and ${table.defaultDurationSeconds} between 1 and 3600 and ${table.defaultDurationSeconds} is not null)`),
  ],
);

export const workoutSessions = pgTable(
  "workout_sessions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    id: varchar("id", { length: 255 }).notNull(),
    planId: varchar("plan_id", { length: 255 }).notNull(),
    mode: workoutModeEnum("mode").notNull(),
    status: workoutStatusEnum("status").notNull().default("active"),
    startedAt: timestamp("started_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    finishedAt: timestamp("finished_at", {
      mode: "date",
      withTimezone: true,
    }),
    recordedOn: date("recorded_on", { mode: "string" }),
    exerciseSnapshot: jsonb("exercise_snapshot")
      .$type<WorkoutExercisePrescription[]>()
      .notNull(),
    setLog: jsonb("set_log").$type<WorkoutSetLog[]>().notNull(),
    legacyMetadata: jsonb("legacy_metadata").$type<JsonObject>(),
    resultMetrics: jsonb("result_metrics").$type<JsonObject>(),
    ...mutableColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    uniqueIndex("workout_sessions_one_live_active_uidx")
      .on(table.userId)
      .where(sql`${table.status} = 'active' and ${table.deletedAt} is null`),
    index("workout_sessions_user_recorded_on_idx").on(
      table.userId,
      table.recordedOn,
    ),
    index("workout_sessions_user_finished_at_idx").on(
      table.userId,
      table.finishedAt,
    ),
    check("workout_sessions_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check(
      "workout_sessions_status_times",
      sql`(${table.status} = 'active' and ${table.finishedAt} is null)
        or (${table.status} <> 'active' and ${table.finishedAt} is not null)`,
    ),
    check(
      "workout_sessions_recorded_on_min",
      sql`${table.recordedOn} is null or ${table.recordedOn} >= date '1900-01-01'`,
    ),
    check(
      "workout_sessions_exercise_count",
      sql`jsonb_typeof(${table.exerciseSnapshot}) = 'array'
        and jsonb_array_length(${table.exerciseSnapshot}) between 1 and 12`,
    ),
    check("workout_sessions_set_log_array", sql`jsonb_typeof(${table.setLog}) = 'array'`),
    check("workout_sessions_metrics_object", sql`${table.resultMetrics} is null or jsonb_typeof(${table.resultMetrics}) = 'object'`),
    check("workout_sessions_mixed_manual", sql`${table.mode} <> 'mixed' or (${table.status} = 'completed' and coalesce(${table.legacyMetadata}->>'source' = 'manual', false))`),
    check("workout_sessions_version_positive", sql`${table.version} > 0`),
  ],
);

export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    budgetRupiah: integer("budget_rupiah"),
    budgetIsManual: boolean("budget_is_manual").notNull().default(false),
    placesArea: varchar("places_area", { length: 120 }),
    ...mutableColumns(),
  },
  (table) => [
    check(
      "user_preferences_budget_positive",
      sql`${table.budgetRupiah} is null or ${table.budgetRupiah} > 0`,
    ),
    check("user_preferences_version_positive", sql`${table.version} > 0`),
  ],
);

export const placeFavorites = pgTable(
  "place_favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    placeId: varchar("place_id", { length: 255 }).notNull(),
    ...mutableColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.placeId] }),
    check("place_favorites_id_not_blank", sql`length(trim(${table.placeId})) > 0`),
    check("place_favorites_version_positive", sql`${table.version} > 0`),
  ],
);

export const mealEntries = pgTable(
  "meal_entries",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    id: varchar("id", { length: 255 }).notNull(),
    note: text("note"),
    menuName: varchar("menu_name", { length: 120 }),
    samplePriceRupiah: integer("sample_price_rupiah"),
    snapshot: jsonb("snapshot").$type<JsonObject>().notNull(),
    catalogId: varchar("catalog_id", { length: 255 }),
    servings: numeric("servings", { mode: "number", precision: 6, scale: 2 }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    recordedOn: date("recorded_on"),
    mealType: varchar("meal_type", { length: 20 }),
    nutritionPerServing: jsonb("nutrition_per_serving").$type<MealNutrition>(),
    caloriesKcal: numeric("calories_kcal", { mode: "number", precision: 12, scale: 2 }),
    proteinGrams: numeric("protein_grams", { mode: "number", precision: 12, scale: 2 }),
    ...mutableColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    check("meal_entries_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check(
      "meal_entries_price_nonnegative",
      sql`${table.samplePriceRupiah} is null or ${table.samplePriceRupiah} >= 0`,
    ),
    check("meal_entries_snapshot_object", sql`jsonb_typeof(${table.snapshot}) = 'object'`),
    check("meal_entries_version_positive", sql`${table.version} > 0`),
    index("meal_entries_daily_idx").on(table.userId, table.recordedOn),
    check("meal_entries_structured", sql`num_nonnulls(${table.servings}, ${table.consumedAt}, ${table.recordedOn}, ${table.mealType}, ${table.nutritionPerServing}, ${table.catalogId}, ${table.caloriesKcal}, ${table.proteinGrams}) = 0 or (num_nonnulls(${table.servings}, ${table.consumedAt}, ${table.recordedOn}, ${table.mealType}, ${table.nutritionPerServing}, ${table.caloriesKcal}, ${table.proteinGrams}) = 7 and ${table.servings} between 0.01 and 20 and ${table.mealType} in ('breakfast', 'lunch', 'dinner', 'snack') and jsonb_typeof(${table.nutritionPerServing}) = 'object' and ${table.caloriesKcal} between 0 and 200000 and ${table.proteinGrams} between 0 and 20000)`),
  ],
);

export const socialDrafts = pgTable(
  "social_drafts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    id: varchar("id", { length: 255 }).notNull(),
    body: text("body").notNull(),
    metadata: jsonb("metadata").$type<JsonObject>(),
    ...mutableColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    check("social_drafts_id_not_blank", sql`length(trim(${table.id})) > 0`),
    check(
      "social_drafts_body_length",
      sql`char_length(trim(${table.body})) between 1 and 2000`,
    ),
    check("social_drafts_version_positive", sql`${table.version} > 0`),
  ],
);

export const legacyUserMetadata = pgTable(
  "legacy_user_metadata",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedIds: text("joined_ids")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default(sql`'{}'::jsonb`),
    ...mutableColumns(),
  },
  (table) => [
    check("legacy_user_metadata_version_positive", sql`${table.version} > 0`),
  ],
);

export type Profile = typeof profiles.$inferSelect;
export type TrainingPreference = typeof trainingPreferences.$inferSelect;
export type CustomProgram = typeof customPrograms.$inferSelect;
export type UserExercise = typeof userExercises.$inferSelect;
export type WorkoutSession = typeof workoutSessions.$inferSelect;
