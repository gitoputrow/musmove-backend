import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, integer, pgTable, primaryKey, smallint, unique, varchar } from "drizzle-orm/pg-core";
import { exerciseCatalog } from "./catalog";
import { trainingModeEnum } from "./enums";

export const workoutProgramCatalog = pgTable("workout_program_catalog", {
  id: varchar("id", { length: 255 }).primaryKey(),
  mode: trainingModeEnum("mode").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  focus: varchar("focus", { length: 20 }).notNull(),
  durationMinutes: smallint("duration_minutes").notNull(),
  active: boolean("active").notNull().default(true),
}, (table) => [
  unique().on(table.id, table.mode),
  check("program_catalog_focus", sql`${table.focus} in ('full', 'leg', 'chest', 'back', 'arm')`),
  check("program_catalog_duration", sql`${table.durationMinutes} between 10 and 180`),
]);

export const workoutProgramExercises = pgTable("workout_program_exercises", {
  programId: varchar("program_id", { length: 255 }).notNull(),
  position: integer("position").notNull(),
  mode: trainingModeEnum("mode").notNull(),
  exerciseId: varchar("exercise_id", { length: 255 }).notNull(),
  sets: smallint("sets").notNull(),
  reps: smallint("reps"),
  targetDurationSeconds: integer("target_duration_seconds"),
}, (table) => [
  primaryKey({ columns: [table.programId, table.position] }),
  unique().on(table.programId, table.exerciseId),
  foreignKey({ columns: [table.programId, table.mode], foreignColumns: [workoutProgramCatalog.id, workoutProgramCatalog.mode] }).onDelete("cascade"),
  foreignKey({ columns: [table.mode, table.exerciseId], foreignColumns: [exerciseCatalog.mode, exerciseCatalog.id] }),
  check("program_exercises_position", sql`${table.position} > 0`),
  check("program_exercises_sets", sql`${table.sets} between 1 and 10`),
  check("program_exercises_reps", sql`${table.reps} between 1 and 100`),
  check("program_exercises_measurement", sql`(${table.reps} is not null and ${table.targetDurationSeconds} is null) or (${table.reps} is null and ${table.targetDurationSeconds} between 1 and 3600 and ${table.targetDurationSeconds} is not null)`),
]);
