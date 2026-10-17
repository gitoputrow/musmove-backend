import { sql } from "drizzle-orm";
import { bigint, boolean, check, jsonb, pgTable, primaryKey, smallint, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { trainingModeEnum } from "./enums";
import type { MovementTag } from "@/src/modules/catalog/movement-tags";

export const exerciseCatalog = pgTable("exercise_catalog", {
  id: varchar("id", { length: 255 }).notNull(),
  mode: trainingModeEnum("mode").notNull(),
  idLabel: varchar("id_label", { length: 80 }).notNull(),
  enLabel: varchar("en_label", { length: 80 }).notNull(),
  defaultSets: smallint("default_sets").notNull(),
  defaultReps: smallint("default_reps").notNull(),
  requirements: jsonb("requirements").$type<string[][]>().notNull(),
  movementTags: text("movement_tags").array().$type<MovementTag[]>().notNull(),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.mode, table.id] }),
  check("exercise_catalog_sets_range", sql`${table.defaultSets} between 1 and 10`),
  check("exercise_catalog_reps_range", sql`${table.defaultReps} between 1 and 100`),
  check("exercise_catalog_requirements_array", sql`jsonb_typeof(${table.requirements}) = 'array' and jsonb_array_length(${table.requirements}) > 0`),
  check("exercise_catalog_movement_tags_valid", sql`array_ndims(${table.movementTags}) = 1 and cardinality(${table.movementTags}) between 1 and 11 and array_position(${table.movementTags}, NULL) is null and ${table.movementTags} <@ ARRAY['shoulder', 'elbow', 'wrist', 'back', 'hip', 'knee', 'ankle', 'floor_transfer', 'overhead_reach', 'deep_knee_bend', 'balance_challenge']::text[]`),
]);

export const catalogState = pgTable("catalog_state", {
  name: varchar("name", { length: 80 }).primaryKey(),
  version: bigint("version", { mode: "bigint" }).notNull().default(sql`1`),
}, (table) => [check("catalog_state_version_positive", sql`${table.version} > 0`)]);
