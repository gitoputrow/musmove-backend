import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { eq, inArray } from "drizzle-orm";

loadEnvConfig(process.cwd());
process.env.SYNC_CURSOR_SECRET = "nutrition-integration-test-secret-32-characters";

async function main() {
  const { getDatabase, getPool } = await import("../../src/db/client");
  const { users, syncState, nutritionEstimates } = await import("../../src/db/schema");
  const { pushOperations } = await import("../../src/modules/sync/service");
  const { syncPushSchema } = await import("../../src/modules/sync/dto");
  const { getNutritionTargets, storeNutritionEstimate } = await import("../../src/modules/nutrition/storage");
  const { FORMULA_VERSION, MAINTENANCE_FORMULA_VERSION } = await import("../../src/modules/nutrition/estimate");
  const { importDemo, demoImportSchema } = await import("../../src/modules/imports/demo");
  const db = getDatabase();
  const ids: string[] = [];
  async function createUser() {
    const [user] = await db.insert(users).values({ issuer: `test://nutrition/${randomUUID()}`, subject: randomUUID() }).returning();
    ids.push(user.id);
    await db.insert(syncState).values({ userId: user.id });
    return user.id;
  }
  const profile = { ageYears: 25, weightKg: 70, heightCm: 175, formulaSex: "male", dailyActivity: "light", goal: "cut" };
  function operation(entityType: "profile", entityId: string, baseVersion: string, payload: unknown) {
    return { action: "upsert", operationId: randomUUID(), entityType, entityId, baseVersion, payload };
  }
  async function push(userId: string, operations: unknown[]) {
    return pushOperations(userId, syncPushSchema.parse({ schemaVersion: 1, deviceId: "nutrition-test", operations }));
  }
  try {
    const user = await createUser();
    assert.equal((await getNutritionTargets(user)).reason, "PROFILE_REQUIRED");
    const create = operation("profile", "profile", "0", profile);
    assert.equal((await push(user, [create])).results[0].status, "applied");
    assert.equal((await push(user, [create])).results[0].status, "duplicate");
    const targets = await getNutritionTargets(user);
    assert.equal(targets.estimate?.calories, 2200);
    assert.equal(targets.estimate?.maintenanceCalories, 2590);
    assert.equal(targets.estimate?.calorieAdjustmentKcal, -390);
    assert.equal(targets.estimate?.normalizedGoal, "cut");
    assert.equal(targets.estimate?.proteinGrams, 140);
    assert.equal(targets.estimate?.proteinFactor, 2);
    assert.equal(targets.formulaVersion, FORMULA_VERSION);
    assert.equal(targets.profileVersion, "1");
    assert.equal(targets.goalAdjustmentApplied, true);
    assert.equal((await db.select().from(nutritionEstimates).where(eq(nutritionEstimates.userId, user))).length, 1);
    // GET/backfill/retries cannot append duplicate snapshots.
    await db.transaction((tx) => storeNutritionEstimate(tx, user));
    assert.equal((await db.select().from(nutritionEstimates).where(eq(nutritionEstimates.userId, user))).length, 1);
    assert.equal((await push(user, [operation("profile", "profile", "0", { ...profile, weightKg: 75 })])).results[0].status, "conflict");
    assert.equal((await push(user, [operation("profile", "profile", "1", { ...profile, weightKg: 75 })])).results[0].status, "applied");
    assert.equal((await getNutritionTargets(user)).estimate?.proteinGrams, 150);
    assert.equal((await db.select().from(nutritionEstimates).where(eq(nutritionEstimates.userId, user))).length, 2);
    // Missing body inputs replace ready estimates with an explicit incomplete snapshot.
    await push(user, [operation("profile", "profile", "2", { ageYears: 25 })]);
    assert.equal((await getNutritionTargets(user)).estimate?.status, "incomplete");
    assert.equal((await getNutritionTargets(user)).estimate?.calories, null);
    await push(user, [operation("profile", "profile", "3", { ...profile, trainingContext: { pregnancyStatus: "pregnant" } })]);
    assert.equal((await getNutritionTargets(user)).estimate?.status, "needsReview");
    await push(user, [{ action: "delete", entityType: "profile", entityId: "profile", baseVersion: "4", operationId: randomUUID() }]);
    assert.equal((await getNutritionTargets(user)).reason, "PROFILE_REQUIRED");
    const importer = await createUser();
    const request = demoImportSchema.parse({ schemaVersion: 1, importId: randomUUID(), entities: [
      { entityType: "profile", entityId: "profile", payload: profile },
    ] });
    await importDemo(importer, request);
    assert.equal((await getNutritionTargets(importer)).estimate?.calories, 2200);
    assert.equal((await importDemo(importer, request)).duplicate, true);
    const goalUser = await createUser();
    for (const [index, goal] of ["bulk", "cut", "maintain", "maintance", "muscle", "fat", "fit"].entries()) {
      await push(goalUser, [operation("profile", "profile", index.toString(), { ...profile, goal })]);
      const target = await getNutritionTargets(goalUser);
      const normalized = ["bulk", "cut", "maintenance", "maintenance", "bulk", "cut", "maintenance"][index];
      assert.equal(target.estimate?.normalizedGoal, normalized);
      assert.equal(target.estimate?.maintenanceCalories, 2590);
      assert.equal(target.estimate?.calories, normalized === "bulk" ? 2850 : normalized === "cut" ? 2200 : 2590);
      assert.equal(target.goalAdjustmentApplied, normalized !== "maintenance");
    }
    const history = await db.select().from(nutritionEstimates).where(eq(nutritionEstimates.userId, goalUser));
    assert.equal(history.length, 7);
    assert.equal(history.find((item) => item.profileVersion === BigInt(1))?.calories, 2850);
    await push(goalUser, [operation("profile", "profile", "7", { ...profile, goal: "unknown" })]);
    assert.deepEqual((await getNutritionTargets(goalUser)).estimate?.reasonCodes, ["NUTRITION_GOAL_UNSUPPORTED"]);

    // Simulate an account with only a legacy v1 estimate. Backfill must append v2,
    // not overwrite history or serve the obsolete maintenance-only target.
    const legacyUser = await createUser();
    await push(legacyUser, [operation("profile", "profile", "0", profile)]);
    await db.delete(nutritionEstimates).where(eq(nutritionEstimates.userId, legacyUser));
    await db.insert(nutritionEstimates).values({
      userId: legacyUser, profileVersion: BigInt(1), formulaVersion: MAINTENANCE_FORMULA_VERSION,
      inputSnapshot: profile, status: "ready", reasonCodes: [], restingKcal: 1673.75,
      calories: 2590, proteinGrams: 112, proteinMin: 98, proteinMax: 140,
    });
    assert.equal((await getNutritionTargets(legacyUser)).reason, "ESTIMATE_REBUILD_REQUIRED");
    await db.transaction((tx) => storeNutritionEstimate(tx, legacyUser));
    assert.equal((await getNutritionTargets(legacyUser)).estimate?.calories, 2200);
    const versionHistory = await db.select().from(nutritionEstimates).where(eq(nutritionEstimates.userId, legacyUser));
    assert.equal(versionHistory.length, 2);
    assert.equal(versionHistory.find((item) => item.formulaVersion === MAINTENANCE_FORMULA_VERSION)?.calories, 2590);
    console.info("Nutrition integration test passed");
  } finally {
    if (ids.length) await db.delete(users).where(inArray(users.id, ids));
    await getPool().end();
  }
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
