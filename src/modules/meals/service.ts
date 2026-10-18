import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/src/db/client";
import { catalogState, mealCatalog, mealEntries } from "@/src/db/schema";
import { readNutritionTargets } from "@/src/modules/nutrition/storage";
import { roundMealNumber } from "./resolve";
import { mealCatalogQuerySchema, type MealCatalogQuery } from "./query";

export const mealsQuerySchema = z.object({
  date: z.iso.date(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
}).strict();

export async function getMealCatalog(query: MealCatalogQuery = mealCatalogQuerySchema.parse({})) {
  return getDatabase().transaction(async (transaction) => {
    const [state] = await transaction.select().from(catalogState).where(eq(catalogState.name, "meals"));
    if (!state) throw new Error("Meal catalog migration has not been applied");
    // strpos is a literal, parameterized substring search: '%'/'_' are not wildcards.
    const filter = and(eq(mealCatalog.active, true),
      query.includeDemo ? undefined : eq(mealCatalog.sourceType, "reference"),
      query.foodGroup ? eq(mealCatalog.foodGroup, query.foodGroup) : undefined,
      query.q ? sql`strpos(lower(concat_ws(' ', ${mealCatalog.idLabel}, ${mealCatalog.enLabel}, ${mealCatalog.sourceCode})), lower(${query.q})) > 0` : undefined);
    const [{ total }] = await transaction.select({ total: sql<number>`count(*)::integer` }).from(mealCatalog).where(filter);
    const rows = await transaction.select().from(mealCatalog).where(filter).orderBy(asc(mealCatalog.idLabel), asc(mealCatalog.id))
      .limit(query.limit).offset(query.offset);
    const hasMore = query.offset + rows.length < total;
    return {
      catalogVersion: state.version.toString(), total, hasMore,
      nextOffset: hasMore ? query.offset + rows.length : null,
      meals: rows.map(({ version, updatedAt, ...meal }) => ({
        ...meal, version: version.toString(), updatedAt: updatedAt.toISOString(),
      })),
      warning: "REFERENCE_VALUES_ARE_NOT_INDIVIDUAL_FOOD_LAB_TESTS",
      warnings: [
        "REFERENCE_VALUES_ARE_NOT_INDIVIDUAL_FOOD_LAB_TESTS", "TKPI_FIBER_METHOD_NOT_DISTINGUISHED",
        "MISSING_NUTRIENTS_ARE_NULL_NOT_ZERO", "FLAGGED_SOURCE_NUTRIENTS_WITHHELD_FOR_REVIEW",
        "FOOD_PRICES_ARE_ESTIMATES_PER_100G_EDIBLE_NOT_LIVE_OFFERS",
        "PRICE_PROXIES_ARE_NOT_INDIVIDUALLY_OBSERVED_FOOD_PRICES",
        ...(query.includeDemo ? ["DEMO_ENTRIES_ARE_NOT_VERIFIED_NUTRITION_OR_PRICES"] : []),
      ],
    };
  }, { accessMode: "read only", isolationLevel: "repeatable read" });
}

export async function listMeals(userId: string, query: z.infer<typeof mealsQuerySchema>) {
  return getDatabase().transaction(async (transaction) => {
    const filter = and(eq(mealEntries.userId, userId), isNull(mealEntries.deletedAt), eq(mealEntries.recordedOn, query.date));
    const rows = await transaction.select().from(mealEntries).where(filter)
      .orderBy(desc(mealEntries.consumedAt), asc(mealEntries.id)).limit(query.limit + 1).offset(query.offset);
    const isDemo = sql`${mealEntries.snapshot}->'nutritionDetails'->>'sourceType' = 'demo'`;
    const [totals] = await transaction.select({
      entryCount: sql<number>`count(*)::integer`,
      demoEntryCount: sql<number>`count(*) filter (where ${isDemo})::integer`,
      caloriesKcal: sql<string>`coalesce(sum(${mealEntries.caloriesKcal}) filter (where not coalesce(${isDemo}, false)), 0)::text`,
      proteinGrams: sql<string>`coalesce(sum(${mealEntries.proteinGrams}) filter (where not coalesce(${isDemo}, false)), 0)::text`,
      demoCaloriesKcal: sql<string>`coalesce(sum(${mealEntries.caloriesKcal}) filter (where ${isDemo}), 0)::text`,
      demoProteinGrams: sql<string>`coalesce(sum(${mealEntries.proteinGrams}) filter (where ${isDemo}), 0)::text`,
    }).from(mealEntries).where(filter);
    const [legacy] = await transaction.select({ count: sql<number>`count(*)::integer` }).from(mealEntries)
      .where(and(eq(mealEntries.userId, userId), isNull(mealEntries.deletedAt), isNull(mealEntries.recordedOn)));
    const targets = await readNutritionTargets(transaction, userId);
    const caloriesKcal = Number(totals.caloriesKcal), proteinGrams = Number(totals.proteinGrams);
    return {
      date: query.date,
      entries: rows.slice(0, query.limit).map(({ userId: _user, version, consumedAt, updatedAt, deletedAt: _deleted, ...row }) => {
        void _user; void _deleted;
        return { ...row, version: version.toString(), consumedAt: consumedAt?.toISOString() ?? null, updatedAt: updatedAt.toISOString() };
      }),
      hasMore: rows.length > query.limit, nextOffset: rows.length > query.limit ? query.offset + query.limit : null,
      // Aggregates cover the entire day, independent of pagination.
      summary: {
        entryCount: totals.entryCount, reportedTotals: { caloriesKcal, proteinGrams },
        demoTotals: { caloriesKcal: Number(totals.demoCaloriesKcal), proteinGrams: Number(totals.demoProteinGrams) },
        demoEntryCount: totals.demoEntryCount, undatedLegacyEntryCount: legacy.count,
        remaining: targets.estimate?.status === "ready" ? {
          caloriesKcal: roundMealNumber(Math.max(0, targets.estimate.calories! - caloriesKcal)),
          proteinGrams: roundMealNumber(Math.max(0, targets.estimate.proteinGrams! - proteinGrams)),
        } : null,
      },
      targets, warnings: ["REPORTED_TOTALS_NOT_INDEPENDENTLY_VERIFIED", "DEMO_ENTRIES_EXCLUDED_FROM_PROGRESS", "LEGACY_ENTRIES_WITHOUT_DATE_NOT_COUNTED"],
    };
  }, { accessMode: "read only", isolationLevel: "repeatable read" });
}
