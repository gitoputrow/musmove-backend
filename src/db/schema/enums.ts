import { pgEnum } from "drizzle-orm/pg-core";

export const accountStatusEnum = pgEnum("account_status", [
  "active",
  "suspended",
  "deletion_requested",
  "deleted",
]);

export const dailyActivityEnum = pgEnum("daily_activity", [
  "light",
  "moderate",
  "vigorous",
]);

export const formulaSexEnum = pgEnum("formula_sex", ["male", "female"]);

export const programSourceEnum = pgEnum("program_source", ["app", "custom"]);

export const trainingModeEnum = pgEnum("training_mode", [
  "gym",
  "calisthenics",
]);

export const workoutStatusEnum = pgEnum("workout_status", [
  "active",
  "completed",
  "aborted",
]);

// Never widen training_mode: profiles, equipment and programs remain single-mode.
export const workoutModeEnum = pgEnum("workout_mode", ["gym", "calisthenics", "mixed"]);

export const syncOperationEnum = pgEnum("sync_operation", [
  "upsert",
  "delete",
]);
