import assert from "node:assert/strict";
import { test } from "node:test";
import fixtures from "../fixtures/nutrition-v1.json";
import { estimateGoalNutrition, estimateNutrition, MAINTENANCE_FORMULA_VERSION, normalizeNutritionGoal, type NutritionInput } from "../../src/modules/nutrition/estimate";
import { mealTotals } from "../../src/modules/meals/resolve";
import { entityPayloadSchemas } from "../../src/modules/sync/dto";

const input: NutritionInput = { ageYears: 25, weightKg: 70, heightCm: 175, formulaSex: "male", dailyActivity: "light" };

for (const fixture of fixtures.cases) {
  test(`Dart-compatible fixture: ${fixture.name}`, () => {
    assert.equal(fixtures.formulaVersion, MAINTENANCE_FORMULA_VERSION);
    const { reasonCodes: _reasons, ...result } = estimateNutrition(fixture.input as NutritionInput);
    void _reasons;
    assert.deepEqual(result, fixture.expected);
  });
}
test("No invented profile defaults, activity or sex", () => {
  for (const field of ["ageYears", "weightKg", "heightCm", "formulaSex", "dailyActivity"] as const) {
    assert.equal(estimateNutrition({ ...input, [field]: null }).status, "incomplete");
  }
});
test("Nonfinite/out-of-range body inputs are withheld", () => {
  for (const weightKg of [NaN, Infinity, 0, 29.99, 250.01]) assert.equal(estimateNutrition({ ...input, weightKg }).status, "needsReview");
  for (const heightCm of [NaN, Infinity, 0, 119.99, 220.01]) assert.equal(estimateNutrition({ ...input, heightCm }).status, "needsReview");
});
test("The Dart-compatible maintenance baseline remains unchanged", () => {
  for (const goal of ["bulk", "cut", "maintain", "muscle", "fat", "fit"]) assert.deepEqual(estimateNutrition({ ...input, goal }), estimateNutrition(input));
});
test("API goals adjust calories/protein while preserving maintenance baseline", () => {
  const expected = { bulk: [2850, 260, 112, 98], cut: [2200, -390, 140, 112], maintenance: [2590, 0, 112, 98] };
  for (const [goal, [calories, adjustment, protein, proteinMin]] of Object.entries(expected)) {
    const result = estimateGoalNutrition({ ...input, goal });
    assert.equal(result.status, "ready");
    assert.equal(result.normalizedGoal, goal);
    assert.equal(result.maintenanceCalories, 2590);
    assert.equal(result.calories, calories);
    assert.equal(result.calorieAdjustmentKcal, adjustment);
    assert.equal(result.proteinGrams, protein);
    assert.equal(result.proteinMin, proteinMin);
    assert.equal(result.proteinMax, 140);
  }
});
test("Existing mobile aliases and user spelling are normalized, not guessed", () => {
  for (const [goal, normalized] of Object.entries({ muscle: "bulk", bulking: "bulk", muscle_gain: "bulk", fat: "cut", fat_loss: "cut", cutting: "cut", maintain: "maintenance", maintance: "maintenance", fit: "maintenance", strength: "maintenance", endurance: "maintenance", " BULK ": "bulk" })) {
    assert.equal(normalizeNutritionGoal(goal), normalized);
    assert.equal(estimateGoalNutrition({ ...input, goal }).normalizedGoal, normalized);
  }
  for (const goal of [null, undefined, "", "mystery"]) {
    const result = estimateGoalNutrition({ ...input, goal });
    assert.equal(result.status, "incomplete");
    assert.equal(result.calories, null);
    assert.equal(result.maintenanceCalories, null);
    assert.deepEqual(result.reasonCodes, [goal === "mystery" ? "NUTRITION_GOAL_UNSUPPORTED" : "NUTRITION_GOAL_REQUIRED"]);
  }
});
test("High estimated expenditure caps surplus/deficit; target rounds to ten kcal", () => {
  const high = { ...input, weightKg: 90, heightCm: 185, dailyActivity: "vigorous" as const };
  assert.equal(estimateGoalNutrition({ ...high, goal: "bulk" }).calorieAdjustmentKcal, 300);
  assert.equal(estimateGoalNutrition({ ...high, goal: "cut" }).calorieAdjustmentKcal, -500);
  for (const goal of ["bulk", "cut", "maintenance"]) assert.equal(estimateGoalNutrition({ ...high, goal }).calories! % 10, 0);
});
test("Cutting review guards withhold outputs instead of silently clamping or switching goal", () => {
  const lowBmi = estimateGoalNutrition({ ...input, weightKg: 59, goal: "cut" });
  assert.equal(lowBmi.status, "needsReview");
  assert.deepEqual(lowBmi.reasonCodes, ["CUT_BODY_COMPOSITION_REVIEW"]);
  const lowEnergy = estimateGoalNutrition({ ...input, ageYears: 70, weightKg: 45, heightCm: 145, formulaSex: "female", goal: "cut" });
  assert.equal(lowEnergy.status, "needsReview");
  assert.deepEqual(lowEnergy.reasonCodes, ["CUT_TARGET_TOO_LOW"]);
  assert.equal(lowEnergy.normalizedGoal, "cut");
  assert.equal(lowEnergy.calories, null);
  assert.equal(lowEnergy.proteinGrams, null);
  assert.equal(lowEnergy.calorieAdjustmentKcal, null);
});
test("Safety gates still run before any goal adjustment", () => {
  for (const goal of ["bulk", "cut", "maintenance"]) {
    for (const trainingContext of [{ pregnancyStatus: "pregnant" as const }, { pregnancyStatus: "postpartum" as const }, { healthStatus: "needs_professional_guidance" as const }]) {
      assert.equal(estimateGoalNutrition({ ...input, goal, trainingContext }).status, "needsReview");
      assert.equal(estimateGoalNutrition({ ...input, goal, trainingContext }).calories, null);
    }
    assert.equal(estimateGoalNutrition({ ...input, goal, ageYears: 18 }).status, "unsupportedAge");
    assert.equal(estimateGoalNutrition({ ...input, goal, weightKg: null }).status, "incomplete");
  }
});
test("Pregnancy/postpartum and professional guidance withhold automatic targets regardless of formula sex", () => {
  for (const pregnancyStatus of ["pregnant", "postpartum"] as const) {
    const result = estimateNutrition({ ...input, trainingContext: { pregnancyStatus } });
    assert.equal(result.status, "needsReview");
    assert.equal(result.calories, null);
    assert.deepEqual(result.reasonCodes, ["SPECIALIZED_NUTRITION_REQUIRED"]);
  }
  assert.equal(estimateNutrition({ ...input, trainingContext: { healthStatus: "needs_professional_guidance" } }).proteinGrams, null);
});
test("Portion totals are deterministic with two-decimal output", () => {
  assert.deepEqual(mealTotals({ caloriesKcal: 380, proteinGrams: 18 }, 1.5), { caloriesKcal: 570, proteinGrams: 27 });
  assert.deepEqual(mealTotals({ caloriesKcal: 100.55, proteinGrams: 10.55 }, 0.33), { caloriesKcal: 33.18, proteinGrams: 3.48 });
});
test("Meal payload retains legacy support and rejects invalid dates/portions/nutrients", () => {
  const legacy = { menuName: null, note: null, samplePriceRupiah: null, snapshot: {} };
  assert.ok(entityPayloadSchemas.meal_entry.safeParse(legacy).success);
  for (const invalid of [{ servings: -1 }, { servings: 21 }, { servings: 0.001 }, { servings: 1.555 }, { recordedOn: "2026-02-30" }, { consumedAt: "no-date" }, { nutrition: { caloriesKcal: -1, proteinGrams: 10 } }, { nutrition: { caloriesKcal: 300, proteinGrams: Infinity } }]) {
    assert.equal(entityPayloadSchemas.meal_entry.safeParse({ ...legacy, ...invalid }).success, false);
  }
});
