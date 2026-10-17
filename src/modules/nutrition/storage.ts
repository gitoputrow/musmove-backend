import { and, eq, isNull } from "drizzle-orm";
import { getDatabase, type Database } from "@/src/db/client";
import { nutritionEstimates, profiles, type JsonObject } from "@/src/db/schema";
import { ACTIVITY_FACTORS, CUT_GUARDS, estimateGoalNutrition, FORMULA_VERSION, GOAL_POLICIES, nutritionSources } from "./estimate";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function storeNutritionEstimate(transaction: Transaction, userId: string) {
  const [profile] = await transaction.select().from(profiles)
    .where(and(eq(profiles.userId, userId), isNull(profiles.deletedAt)));
  if (!profile) return;
  const input = {
    ageYears: profile.ageYears, weightKg: profile.weightKg, heightCm: profile.heightCm,
    formulaSex: profile.formulaSex, dailyActivity: profile.dailyActivity,
    goal: profile.goal, trainingContext: profile.trainingContext,
  };
  await transaction.insert(nutritionEstimates).values({
    userId, profileVersion: profile.version, formulaVersion: FORMULA_VERSION,
    inputSnapshot: input as unknown as JsonObject, ...estimateGoalNutrition(input),
  }).onConflictDoNothing();
}

export async function readNutritionTargets(transaction: Transaction, userId: string) {
  const [profile] = await transaction.select().from(profiles)
    .where(and(eq(profiles.userId, userId), isNull(profiles.deletedAt)));
  const base = {
    formulaVersion: FORMULA_VERSION, caloriePolicy: "goal_adjusted_v2", goalAdjustmentApplied: false,
    goalPolicies: GOAL_POLICIES, cutGuards: CUT_GUARDS,
    activityFactors: ACTIVITY_FACTORS, sources: nutritionSources,
    warnings: ["ESTIMATE_NOT_MEDICAL_ADVICE", "ACTIVITY_FACTOR_IS_APPROXIMATE", "PROTEIN_RANGE_FOR_EXERCISING_ADULTS", "GOAL_POLICY_IS_STARTING_HEURISTIC", "REVIEW_TARGETS_WITH_WEIGHT_TREND_AND_HEALTH_CONTEXT"],
  };
  if (!profile) return { ...base, profileVersion: null, estimate: null, reason: "PROFILE_REQUIRED" };
  const [estimate] = await transaction.select().from(nutritionEstimates).where(and(
    eq(nutritionEstimates.userId, userId), eq(nutritionEstimates.profileVersion, profile.version),
    eq(nutritionEstimates.formulaVersion, FORMULA_VERSION),
  ));
  return {
    ...base, profileVersion: profile.version.toString(),
    goalAdjustmentApplied: estimate?.status === "ready" && (estimate.calorieAdjustmentKcal ?? 0) !== 0,
    // Never serve a stale profile/formula snapshot and never write from GET.
    estimate: estimate ? {
      status: estimate.status, reasonCodes: estimate.reasonCodes, restingKcal: estimate.restingKcal,
      calories: estimate.calories, proteinGrams: estimate.proteinGrams,
      proteinMin: estimate.proteinMin, proteinMax: estimate.proteinMax,
      normalizedGoal: estimate.normalizedGoal, maintenanceCalories: estimate.maintenanceCalories,
      calorieAdjustmentKcal: estimate.calorieAdjustmentKcal, proteinFactor: estimate.proteinFactor,
      inputSnapshot: estimate.inputSnapshot, calculatedAt: estimate.createdAt.toISOString(),
    } : null,
    reason: estimate ? null : "ESTIMATE_REBUILD_REQUIRED",
  };
}

export async function getNutritionTargets(userId: string) {
  return getDatabase().transaction((transaction) => readNutritionTargets(transaction, userId),
    { accessMode: "read only", isolationLevel: "repeatable read" });
}
