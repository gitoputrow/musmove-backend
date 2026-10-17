import { readFile } from "node:fs/promises";
import { z } from "zod";
import { foodGroups } from "../src/modules/meals/types";

const numeric = z.number().finite().nonnegative().nullable();
const foodSchema = z.object({
  code: z.string().regex(/^[A-Z][RP]\d{3}$/),
  name: z.string().min(1).max(120), enLabel: z.string().min(1).max(120).nullable(),
  foodGroup: z.enum(foodGroups), foodKind: z.enum(["single", "processed_or_composite"]),
  pdfPage: z.number().int().min(16).max(70), printedPage: z.number().int().min(9).max(63),
  originalReference: z.string().min(1), ediblePercent: numeric.refine((value) => value === null || value <= 100),
  nutrients: z.record(z.string(), numeric), imputedOrBorrowedFields: z.array(z.string()),
}).strict();
export type TkpiFood = z.infer<typeof foodSchema>;

// Conservative editorial triage, NOT nutritional/clinical limits. These
// suspicious source cells stay verbatim in the snapshot. We neither silently
// fix the decimal point nor expose them as usable micronutrient amounts.
export function curateAdditionalNutrients(food: TkpiFood) {
  const main = new Set(["caloriesKcal", "proteinGrams", "carbohydrateGrams", "fatGrams", "fiberGrams", "sodiumMg"]);
  const reviewAbove: Record<string, number> = { ashGrams: 100, copperMg: 50, thiaminMg: 10, riboflavinMg: 10, niacinMg: 100 };
  const additionalNutrients: Record<string, number | null> = {};
  const withheldNutrients: Record<string, { sourceValue: number; reason: "SOURCE_OUTLIER_REQUIRES_REVIEW" }> = {};
  for (const [field, value] of Object.entries(food.nutrients)) {
    if (main.has(field)) continue;
    if (value !== null && reviewAbove[field] !== undefined && value > reviewAbove[field]) {
      additionalNutrients[field] = null;
      withheldNutrients[field] = { sourceValue: value, reason: "SOURCE_OUTLIER_REQUIRES_REVIEW" };
    } else additionalNutrients[field] = value;
  }
  return { additionalNutrients, withheldNutrients };
}

export async function loadTkpiSnapshot() {
  const raw = JSON.parse(await readFile(new URL("../src/db/data/tkpi-2017.json", import.meta.url), "utf8"));
  if (!Array.isArray(raw.foodFields) || !Array.isArray(raw.nutrientFields)
    || raw.foodFields.length !== 11 || raw.nutrientFields.length !== 21) throw new Error("Invalid TKPI column manifest");
  const foods = raw.foods.map((row: unknown[]) => {
    if (row.length !== raw.foodFields.length) throw new Error("Invalid TKPI food row length");
    const record = Object.fromEntries(raw.foodFields.map((key: string, i: number) => [key, row[i]]));
    if (record.nutrients.length !== raw.nutrientFields.length) throw new Error("Invalid TKPI nutrient row length");
    record.nutrients = Object.fromEntries(raw.nutrientFields.map((key: string, i: number) => [key, record.nutrients[i]]));
    record.imputedOrBorrowedFields = record.imputedOrBorrowedFields.map((index: number) => raw.nutrientFields[index]);
    return foodSchema.parse(record);
  }) as TkpiFood[];
  if (foods.length !== 1146 || new Set(foods.map((food) => food.code)).size !== foods.length) throw new Error("Incomplete/duplicate TKPI snapshot");
  return { ...raw, foods } as {
    dataset: string; sourceUrl: string; sourcePdfUrl: string; sourceSha256: string;
    checkedAt: string; nutrientBasisGrams: number; foods: TkpiFood[];
  };
}
