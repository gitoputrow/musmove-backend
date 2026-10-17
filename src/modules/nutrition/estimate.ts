import type { TrainingContext } from "@/src/db/schema/types";

export const MAINTENANCE_FORMULA_VERSION = "mifflin-pal-protein-v1";
export const FORMULA_VERSION = "mifflin-pal-goals-v2";
export const ACTIVITY_FACTORS = { light: 1.55, moderate: 1.85, vigorous: 2.2 } as const;
export interface NutritionInput {
  ageYears: number | null;
  weightKg: number | null;
  heightCm: number | null;
  formulaSex: "male" | "female" | null;
  dailyActivity: keyof typeof ACTIVITY_FACTORS | null;
  goal?: string | null;
  trainingContext?: TrainingContext | null;
}
export interface NutritionResult {
  status: "ready" | "incomplete" | "unsupportedAge" | "needsReview";
  reasonCodes: string[];
  restingKcal: number | null;
  calories: number | null;
  proteinGrams: number | null;
  proteinMin: number | null;
  proteinMax: number | null;
}
const withheld = (status: NutritionResult["status"], ...reasonCodes: string[]): NutritionResult => ({
  status, reasonCodes, restingKcal: null, calories: null, proteinGrams: null, proteinMin: null, proteinMax: null,
});

export type NutritionGoal = "bulk" | "cut" | "maintenance";
// Starting product heuristics for exercising adults, not clinical prescriptions.
export const GOAL_POLICIES = {
  bulk: { calorieRatio: 0.1, maxAdjustmentKcal: 300, proteinFactor: 1.6, proteinMinFactor: 1.4, proteinMaxFactor: 2 },
  cut: { calorieRatio: -0.15, maxAdjustmentKcal: 500, proteinFactor: 2, proteinMinFactor: 1.6, proteinMaxFactor: 2 },
  maintenance: { calorieRatio: 0, maxAdjustmentKcal: 0, proteinFactor: 1.6, proteinMinFactor: 1.4, proteinMaxFactor: 2 },
} as const;
export const CUT_GUARDS = { minimumTargetKcal: 1500, minimumBmi: 20 } as const;

export function normalizeNutritionGoal(goal: string | null | undefined): NutritionGoal | null {
  switch (goal?.trim().toLowerCase()) {
    case "bulk": case "bulking": case "muscle": case "muscle_gain": return "bulk";
    case "cut": case "cutting": case "fat": case "fat_loss": return "cut";
    case "maintain": case "maintenance": case "maintance": case "fit":
    case "general": case "general_fitness": case "strength": case "endurance": return "maintenance";
    default: return null;
  }
}

export interface GoalNutritionResult extends NutritionResult {
  normalizedGoal: NutritionGoal | null;
  maintenanceCalories: number | null;
  calorieAdjustmentKcal: number | null;
  proteinFactor: number | null;
}

/** Preserve the Dart-compatible baseline; API v2 adds an explicit goal policy. */
export function estimateGoalNutrition(input: NutritionInput): GoalNutritionResult {
  const normalizedGoal = normalizeNutritionGoal(input.goal);
  const noGoalValues = { normalizedGoal, maintenanceCalories: null, calorieAdjustmentKcal: null, proteinFactor: null };
  const baseline = estimateNutrition(input);
  if (baseline.status !== "ready") return { ...baseline, ...noGoalValues };
  if (!normalizedGoal) return {
    ...withheld("incomplete", input.goal?.trim() ? "NUTRITION_GOAL_UNSUPPORTED" : "NUTRITION_GOAL_REQUIRED"), ...noGoalValues,
  };
  const policy = GOAL_POLICIES[normalizedGoal];
  const maintenanceCalories = baseline.calories!;
  const adjustmentMagnitude = Math.round(Math.min(maintenanceCalories * Math.abs(policy.calorieRatio), policy.maxAdjustmentKcal) / 10) * 10;
  const calorieAdjustmentKcal = policy.calorieRatio < 0 ? -adjustmentMagnitude : adjustmentMagnitude;
  const calories = maintenanceCalories + calorieAdjustmentKcal;
  if (normalizedGoal === "cut") {
    const bmi = input.weightKg! / ((input.heightCm! / 100) ** 2);
    // Conservative review guards; these thresholds do not certify diet safety.
    if (bmi < CUT_GUARDS.minimumBmi) return { ...withheld("needsReview", "CUT_BODY_COMPOSITION_REVIEW"), ...noGoalValues };
    if (calories < CUT_GUARDS.minimumTargetKcal) return { ...withheld("needsReview", "CUT_TARGET_TOO_LOW"), ...noGoalValues };
  }
  return {
    ...baseline, normalizedGoal, maintenanceCalories, calorieAdjustmentKcal, calories,
    proteinFactor: policy.proteinFactor,
    proteinGrams: Math.round(input.weightKg! * policy.proteinFactor),
    proteinMin: Math.round(input.weightKg! * policy.proteinMinFactor),
    proteinMax: Math.round(input.weightKg! * policy.proteinMaxFactor),
  };
}

/** Numeric contract matches the existing Dart estimator; context adds safety gates. */
export function estimateNutrition(input: NutritionInput): NutritionResult {
  const { ageYears: age, weightKg: weight, heightCm: height, formulaSex, dailyActivity } = input;
  if (age === null) return withheld("incomplete", "AGE_REQUIRED");
  if (!Number.isInteger(age) || age < 19 || age > 78) return withheld("unsupportedAge", "AGE_OUTSIDE_MODEL_RANGE");
  if (input.trainingContext?.pregnancyStatus === "pregnant" || input.trainingContext?.pregnancyStatus === "postpartum") {
    return withheld("needsReview", "SPECIALIZED_NUTRITION_REQUIRED");
  }
  if (input.trainingContext?.healthStatus === "needs_professional_guidance") {
    return withheld("needsReview", "PROFESSIONAL_GUIDANCE_REQUIRED");
  }
  if (weight === null || height === null || formulaSex === null || dailyActivity === null) {
    return withheld("incomplete", "BODY_INPUTS_REQUIRED");
  }
  if (!Number.isFinite(weight) || !Number.isFinite(height) || weight < 30 || weight > 250 || height < 120 || height > 220) {
    return withheld("needsReview", "BODY_MEASUREMENTS_REVIEW");
  }
  const bmi = weight / ((height / 100) ** 2);
  // Existing conservative product guard, not a diagnosis or study limitation.
  if (bmi < 18.5 || bmi >= 30) return withheld("needsReview", "BODY_COMPOSITION_REVIEW");
  const restingKcal = 10 * weight + 6.25 * height - 5 * age + (formulaSex === "male" ? 5 : -161);
  return {
    status: "ready", reasonCodes: [], restingKcal,
    calories: Math.round(restingKcal * ACTIVITY_FACTORS[dailyActivity] / 10) * 10,
    proteinGrams: Math.round(weight * 1.6), proteinMin: Math.round(weight * 1.4), proteinMax: Math.round(weight * 2),
  };
}

export const nutritionSources = [
  { id: "mifflin", url: "https://pubmed.ncbi.nlm.nih.gov/2305711/" },
  { id: "fao", url: "https://www.fao.org/4/y5686e/y5686e07.htm" },
  { id: "issn", url: "https://link.springer.com/article/10.1186/s12970-017-0177-8" },
  { id: "morton", url: "https://pubmed.ncbi.nlm.nih.gov/28698222/" },
  { id: "off_season_review", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6680710/" },
  { id: "niddk_scope", url: "https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner" },
];
