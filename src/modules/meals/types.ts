export const foodGroups = [
  "cereals", "tubers", "legumes", "vegetables", "fruits", "meat_poultry",
  "fish_seafood", "eggs", "dairy", "fats_oils", "sugars_confectionery",
  "condiments", "beverages",
] as const;

export interface MealNutrition {
  caloriesKcal: number;
  proteinGrams: number;
  carbohydrateGrams?: number | null;
  fatGrams?: number | null;
  fiberGrams?: number | null;
  sodiumMg?: number | null;
}

export interface FoodSourceDetails {
  dataset: string;
  pdfPage: number;
  printedPage: number;
  originalReference: string;
  ediblePercent: number | null;
  imputedOrBorrowedFields: string[];
  additionalNutrients: Record<string, number | null>;
  withheldNutrients: Record<string, { sourceValue: number; reason: "SOURCE_OUTLIER_REQUIRES_REVIEW" }>;
}
