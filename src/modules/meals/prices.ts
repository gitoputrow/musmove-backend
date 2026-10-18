import { z } from "zod";

// Pricing provenance is deliberately independent of the TKPI nutrition source.
export const foodPriceReferenceSchema = z.object({
  id: z.string().min(1).max(160),
  productName: z.string().min(1).max(300),
  sourceName: z.string().min(1).max(120),
  sourceUrl: z.url().startsWith("https://"),
  location: z.string().min(1).max(200),
  checkedAt: z.iso.date(),
  sourceDate: z.iso.date().nullable(),
  access: z.enum(["live_page", "search_index", "historical_document"]),
  priceRupiah: z.number().int().positive().max(100_000_000),
  quantity: z.number().positive(),
  unit: z.enum(["g", "ml"]),
  edibleBasis: z.enum(["edible", "as_purchased"]),
  note: z.string().max(600),
}).strict();

const calculationSchema = z.object({
  sourceWeightGrams: z.number().positive(),
  densityGramsPerMl: z.number().positive().nullable(),
  edibleFraction: z.number().positive().max(1),
  cookedYieldFactor: z.number().positive(),
  cookingCostRupiahPer100g: z.number().int().nonnegative(),
  roundingRupiah: z.literal(100),
}).strict();

const common = {
  methodVersion: z.literal("internet-reference-estimates-v1"),
  currency: z.literal("IDR"),
  basisGrams: z.literal(100),
  checkedAt: z.iso.date(),
  assumptions: z.array(z.string().min(1).max(600)).min(1).max(12),
};

export const foodPriceDetailsSchema = z.discriminatedUnion("status", [
  z.object({ ...common,
    status: z.literal("estimated"),
    label: z.literal("Estimasi harga, bukan harga jual pasti"),
    method: z.enum(["reference_conversion", "similar_food_proxy", "category_proxy", "ingredient_cost_model"]),
    confidence: z.enum(["medium", "low"]),
    reference: foodPriceReferenceSchema,
    calculation: calculationSchema,
  }).strict(),
  z.object({ ...common,
    status: z.literal("not_priced"),
    label: z.literal("Tidak diberi estimasi harga"),
    reasonCode: z.enum(["NOT_A_RETAIL_FOOD", "SENSITIVE_FOOD_REQUIRES_REVIEW"]),
    reference: z.null(), calculation: z.null(),
  }).strict(),
]);

export type FoodPriceReference = z.infer<typeof foodPriceReferenceSchema>;
export type FoodPriceDetails = z.infer<typeof foodPriceDetailsSchema>;

// IS TRUE prevents missing JSON keys passing a CHECK via SQL NULL logic.
export const foodPriceDetailsCheckSql = `price_details IS NULL OR (
  jsonb_typeof(price_details) = 'object' AND price_details->>'currency' = 'IDR'
  AND (price_details->>'basisGrams')::numeric = portion_grams
  AND price_details->>'methodVersion' = 'internet-reference-estimates-v1'
  AND CASE price_details->>'status'
    WHEN 'estimated' THEN sample_price_rupiah > 0 AND price_details->>'label' = 'Estimasi harga, bukan harga jual pasti'
      AND price_details->>'method' IN ('reference_conversion','similar_food_proxy','category_proxy','ingredient_cost_model')
      AND price_details->>'confidence' IN ('medium','low')
      AND jsonb_typeof(price_details->'reference') = 'object'
      AND (price_details->'reference'->>'sourceUrl') ~ '^https://[^[:space:]]+$'
      AND jsonb_typeof(price_details->'calculation') = 'object'
    WHEN 'not_priced' THEN sample_price_rupiah IS NULL AND price_details->'reference' = 'null'::jsonb
      AND price_details->'calculation' = 'null'::jsonb
      AND price_details->>'reasonCode' IN ('NOT_A_RETAIL_FOOD','SENSITIVE_FOOD_REQUIRES_REVIEW')
    ELSE false END
) IS TRUE`;

export function calculateFoodPrice(reference: FoodPriceReference, calculation: NonNullable<FoodPriceDetails["calculation"]>) {
  const value = reference.priceRupiah * 100 / calculation.sourceWeightGrams
    / calculation.edibleFraction / calculation.cookedYieldFactor + calculation.cookingCostRupiahPer100g;
  // Deliberately avoid rupiah-level precision on approximate market estimates.
  return Math.max(100, Math.round(value / 100) * 100);
}
