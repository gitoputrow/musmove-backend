import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { mealCatalog, mealEntries } from "@/src/db/schema";
import { badRequest } from "@/src/lib/api-error";
import { entityPayloadSchemas } from "@/src/modules/sync/dto";
import type { DatabaseTransaction } from "@/src/modules/sync/entities";
import type { MealNutrition } from "./types";

type MealPayload = z.infer<typeof entityPayloadSchemas.meal_entry>;
export const roundMealNumber = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function mealTotals(nutrition: MealNutrition, servings: number): MealNutrition {
  const totals: MealNutrition = { caloriesKcal: roundMealNumber(nutrition.caloriesKcal * servings), proteinGrams: roundMealNumber(nutrition.proteinGrams * servings) };
  for (const field of ["carbohydrateGrams", "fatGrams", "fiberGrams", "sodiumMg"] as const) {
    const value = nutrition[field];
    if (value !== undefined) totals[field] = value === null ? null : roundMealNumber(value * servings);
  }
  return totals;
}

export async function resolveMealPayload(transaction: DatabaseTransaction, userId: string, entityId: string, parsed: MealPayload) {
  const [current] = await transaction.select().from(mealEntries)
    .where(and(eq(mealEntries.userId, userId), eq(mealEntries.id, entityId)));
  const catalogId = parsed.catalogId === undefined ? current?.catalogId ?? null : parsed.catalogId;
  const servings = parsed.servings === undefined ? current?.servings ?? null : parsed.servings;
  const consumedAt = parsed.consumedAt === undefined ? current?.consumedAt?.toISOString() ?? null : parsed.consumedAt;
  const recordedOn = parsed.recordedOn === undefined ? current?.recordedOn ?? null : parsed.recordedOn;
  const mealType = parsed.mealType === undefined ? current?.mealType ?? null : parsed.mealType;
  let nutrition = parsed.nutrition === undefined ? current?.nutritionPerServing ?? null : parsed.nutrition;
  let menuName = parsed.menuName;
  let price = parsed.samplePriceRupiah;
  let details: unknown = null;

  if (catalogId !== null) {
    const oldDetails = current?.snapshot.nutritionDetails;
    if (current?.catalogId === catalogId && current.nutritionPerServing && oldDetails) {
      // Historical portions retain the original nutrition, even after catalog edits/deactivation.
      nutrition = current.nutritionPerServing;
      menuName = current.menuName;
      price = current.samplePriceRupiah;
      details = oldDetails;
    } else {
      const [meal] = await transaction.select().from(mealCatalog)
        .where(and(eq(mealCatalog.id, catalogId), eq(mealCatalog.active, true)));
      if (!meal) throw badRequest("MEAL_NOT_AVAILABLE", "Choose an active meal catalog entry");
      nutrition = { caloriesKcal: meal.caloriesKcal, proteinGrams: meal.proteinGrams };
      if (meal.sourceType === "reference") {
        nutrition = { ...nutrition, carbohydrateGrams: meal.carbohydrateGrams, fatGrams: meal.fatGrams,
          fiberGrams: meal.fiberGrams, sodiumMg: meal.sodiumMg };
      }
      menuName = meal.idLabel;
      price = meal.samplePriceRupiah;
      details = {
        sourceType: meal.sourceType, sourceNote: meal.sourceNote, sourceUrl: meal.sourceUrl,
        catalogId, catalogVersion: meal.version.toString(), portionLabel: meal.portionLabel,
        portionGrams: meal.portionGrams, foodGroup: meal.foodGroup, foodKind: meal.foodKind,
        sourceCode: meal.sourceCode, sourceCheckedAt: meal.sourceCheckedAt, sourceDetails: meal.sourceDetails,
      };
    }
  } else if (current?.catalogId && parsed.nutrition === undefined) {
    // Switching to a custom meal must explicitly supply its own nutrition.
    nutrition = null;
  }

  const structured = [catalogId, servings, consumedAt, recordedOn, mealType, nutrition].some((value) => value !== null);
  if (structured && (servings === null || consumedAt === null || recordedOn === null || mealType === null || nutrition === null)) {
    throw badRequest("MEAL_FIELDS_REQUIRED", "Structured meals require servings, consumedAt, recordedOn, mealType and either catalogId or nutrition per serving");
  }
  if (consumedAt && recordedOn) {
    // recordedOn is the user's local date; UTC day may differ by one day.
    const utcDay = Date.parse(`${new Date(consumedAt).toISOString().slice(0, 10)}T00:00:00Z`);
    if (Math.abs(Date.parse(`${recordedOn}T00:00:00Z`) - utcDay) > 86_400_000) {
      throw badRequest("MEAL_DATE_MISMATCH", "recordedOn must match the consumption date in the user's time zone");
    }
  }
  // Client metadata cannot forge catalog provenance or totals.
  const { nutritionDetails: _ignored, ...snapshot } = parsed.snapshot;
  void _ignored;
  return {
    ...parsed, menuName, samplePriceRupiah: price, catalogId, servings,
    consumedAt: consumedAt ? new Date(consumedAt).toISOString() : null, recordedOn, mealType,
    nutrition,
    snapshot: structured && nutrition && servings !== null ? {
      ...snapshot,
      nutritionDetails: {
        ...(details as Record<string, unknown> ?? { sourceType: "user_reported", sourceNote: "User supplied per-serving nutrition; not independently verified", sourceUrl: null }),
        perServing: nutrition, total: mealTotals(nutrition, servings),
      },
    } : snapshot,
  };
}
