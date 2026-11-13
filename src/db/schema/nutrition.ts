import { sql } from "drizzle-orm";
import { bigint, check, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users";
import type { JsonObject } from "./types";

// Append-only, server-owned estimates; never accepted as client sync entities.
export const nutritionEstimates = pgTable("nutrition_estimates", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  profileVersion: bigint("profile_version", { mode: "bigint" }).notNull(),
  formulaVersion: varchar("formula_version", { length: 80 }).notNull(),
  status: varchar("status", { length: 30 }).notNull(),
  inputSnapshot: jsonb("input_snapshot").$type<JsonObject>().notNull(),
  reasonCodes: text("reason_codes").array().notNull(),
  restingKcal: numeric("resting_kcal", { mode: "number", precision: 12, scale: 4 }),
  calories: integer("calories"),
  proteinGrams: integer("protein_grams"),
  proteinMin: integer("protein_min"),
  proteinMax: integer("protein_max"),
  normalizedGoal: varchar("normalized_goal", { length: 20 }).$type<"bulk" | "cut" | "maintenance">(),
  maintenanceCalories: integer("maintenance_calories"),
  calorieAdjustmentKcal: integer("calorie_adjustment_kcal"),
  proteinFactor: numeric("protein_factor", { mode: "number", precision: 4, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.profileVersion, table.formulaVersion] }),
  check("nutrition_estimates_version", sql`${table.profileVersion} > 0`),
  check("nutrition_estimates_status", sql`${table.status} in ('ready', 'incomplete', 'unsupportedAge', 'needsReview')`),
  check("nutrition_estimates_goal", sql`${table.normalizedGoal} is null or ${table.normalizedGoal} in ('bulk', 'cut', 'maintenance')`),
  check("nutrition_estimates_goal_values", sql`${table.formulaVersion} <> 'mifflin-pal-goals-v2' or (${table.status} = 'ready' and num_nonnulls(${table.normalizedGoal}, ${table.maintenanceCalories}, ${table.calorieAdjustmentKcal}, ${table.proteinFactor}) = 4 and ${table.maintenanceCalories} > 0 and ${table.calories} = ${table.maintenanceCalories} + ${table.calorieAdjustmentKcal} and ((${table.normalizedGoal} = 'bulk' and ${table.calorieAdjustmentKcal} between 0 and 300 and ${table.proteinFactor} = 1.6) or (${table.normalizedGoal} = 'cut' and ${table.calorieAdjustmentKcal} between -500 and 0 and ${table.calories} >= 1500 and ${table.proteinFactor} = 2) or (${table.normalizedGoal} = 'maintenance' and ${table.calorieAdjustmentKcal} = 0 and ${table.proteinFactor} = 1.6))) or (${table.status} <> 'ready' and num_nonnulls(${table.maintenanceCalories}, ${table.calorieAdjustmentKcal}, ${table.proteinFactor}) = 0)`),
  check("nutrition_estimates_v3_goal_values", sql`${table.formulaVersion} <> 'mifflin-routine-goals-v3' or (${table.status} = 'ready' and num_nonnulls(${table.normalizedGoal}, ${table.maintenanceCalories}, ${table.calorieAdjustmentKcal}, ${table.proteinFactor}) = 4 and ${table.maintenanceCalories} > 0 and ${table.calories} = ${table.maintenanceCalories} + ${table.calorieAdjustmentKcal} and ((${table.normalizedGoal} = 'bulk' and ${table.calorieAdjustmentKcal} between 0 and 300 and ${table.proteinFactor} = 1.6) or (${table.normalizedGoal} = 'cut' and ${table.calorieAdjustmentKcal} between -500 and 0 and ${table.calories} >= 1500 and ${table.proteinFactor} = 2) or (${table.normalizedGoal} = 'maintenance' and ${table.calorieAdjustmentKcal} = 0 and ${table.proteinFactor} = 1.6))) or (${table.status} <> 'ready' and num_nonnulls(${table.maintenanceCalories}, ${table.calorieAdjustmentKcal}, ${table.proteinFactor}) = 0)`),
  check("nutrition_estimates_values", sql`(${table.status} = 'ready' and num_nonnulls(${table.restingKcal}, ${table.calories}, ${table.proteinGrams}, ${table.proteinMin}, ${table.proteinMax}) = 5 and ${table.restingKcal} > 0 and ${table.calories} > 0 and ${table.proteinGrams} > 0 and ${table.proteinMin} > 0 and ${table.proteinMax} >= ${table.proteinMin}) or (${table.status} <> 'ready' and num_nonnulls(${table.restingKcal}, ${table.calories}, ${table.proteinGrams}, ${table.proteinMin}, ${table.proteinMax}) = 0)`),
]);
