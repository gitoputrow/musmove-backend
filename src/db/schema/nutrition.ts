import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users";
import type { JsonObject } from "./types";
import type { FoodSourceDetails } from "@/src/modules/meals/types";
import type { FoodPriceDetails } from "@/src/modules/meals/prices";
import { foodPriceDetailsCheckSql } from "@/src/modules/meals/prices";
import { foodGroups } from "@/src/modules/meals/types";

export const mealCatalog = pgTable("meal_catalog", {
  id: varchar("id", { length: 255 }).primaryKey(),
  idLabel: varchar("id_label", { length: 120 }).notNull(),
  enLabel: varchar("en_label", { length: 120 }),
  portionGrams: numeric("portion_grams", { mode: "number", precision: 10, scale: 2 }),
  foodGroup: varchar("food_group", { length: 32 }).$type<typeof foodGroups[number]>(),
  caloriesKcal: numeric("calories_kcal", { mode: "number", precision: 10, scale: 2 }).notNull(),
  proteinGrams: numeric("protein_grams", { mode: "number", precision: 10, scale: 2 }).notNull(),
  carbohydrateGrams: numeric("carbohydrate_grams", { mode: "number", precision: 10, scale: 2 }),
  fatGrams: numeric("fat_grams", { mode: "number", precision: 10, scale: 2 }),
  fiberGrams: numeric("fiber_grams", { mode: "number", precision: 10, scale: 2 }),
  sodiumMg: numeric("sodium_mg", { mode: "number", precision: 12, scale: 2 }),
  samplePriceRupiah: integer("sample_price_rupiah"),
  priceDetails: jsonb("price_details").$type<FoodPriceDetails>(),
  sourceType: varchar("source_type", { length: 20 }).notNull(),
  sourceNote: text("source_note").notNull(),
  sourceUrl: text("source_url"),
  sourceCode: varchar("source_code", { length: 40 }),
  sourceCheckedAt: date("source_checked_at"),
  sourceDetails: jsonb("source_details").$type<FoodSourceDetails>(),
  active: boolean("active").notNull().default(true),
  version: bigint("version", { mode: "bigint" }).notNull().default(sql`1`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("meal_catalog_nutrients", sql`${table.caloriesKcal} between 0 and 10000 and ${table.proteinGrams} between 0 and 1000`),
  check("meal_catalog_source", sql`${table.sourceType} in ('demo', 'reference') and (${table.sourceType} = 'demo' or ${table.sourceUrl} is not null)`),
  check("meal_catalog_price", sql`${table.samplePriceRupiah} is null or ${table.samplePriceRupiah} >= 0`),
  check("meal_catalog_price_details", sql.raw(foodPriceDetailsCheckSql)),
  check("meal_catalog_reference_price_metadata", sql`${table.sourceType} <> 'reference' or ${table.priceDetails} is not null`),
  check("meal_catalog_version", sql`${table.version} > 0`),
  check("meal_catalog_portion_grams", sql`${table.portionGrams} > 0 and ${table.portionGrams} <= 10000`),
  check("meal_catalog_macros", sql`(${table.carbohydrateGrams} is null or ${table.carbohydrateGrams} between 0 and 1000) and (${table.fatGrams} is null or ${table.fatGrams} between 0 and 1000) and (${table.fiberGrams} is null or ${table.fiberGrams} between 0 and 1000) and (${table.sodiumMg} is null or ${table.sodiumMg} between 0 and 100000)`),
  check("meal_catalog_food_group", sql`${table.foodGroup} in (${sql.join(foodGroups.map((group) => sql.raw(`'${group}'`)), sql`, `)})`),
  check("meal_catalog_source_details", sql`${table.sourceDetails} is null or jsonb_typeof(${table.sourceDetails}) = 'object'`),
  check("meal_catalog_reference_metadata", sql`${table.sourceType} <> 'reference' or (num_nonnulls(${table.portionGrams}, ${table.foodGroup}, ${table.sourceCode}, ${table.sourceCheckedAt}, ${table.sourceDetails}) = 5 and length(trim(${table.sourceCode})) > 0 and length(trim(${table.sourceUrl})) > 0)`),
  uniqueIndex("meal_catalog_source_code_unique").on(table.sourceUrl, table.sourceCode),
]);

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
  check("nutrition_estimates_values", sql`(${table.status} = 'ready' and num_nonnulls(${table.restingKcal}, ${table.calories}, ${table.proteinGrams}, ${table.proteinMin}, ${table.proteinMax}) = 5 and ${table.restingKcal} > 0 and ${table.calories} > 0 and ${table.proteinGrams} > 0 and ${table.proteinMin} > 0 and ${table.proteinMax} >= ${table.proteinMin}) or (${table.status} <> 'ready' and num_nonnulls(${table.restingKcal}, ${table.calories}, ${table.proteinGrams}, ${table.proteinMin}, ${table.proteinMax}) = 0)`),
]);
