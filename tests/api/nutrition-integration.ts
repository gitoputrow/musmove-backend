import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { eq, inArray } from "drizzle-orm";

loadEnvConfig(process.cwd());
process.env.SYNC_CURSOR_SECRET = "nutrition-integration-test-secret-32-characters";

async function main() {
  const { getDatabase, getPool } = await import("../../src/db/client");
  const { users, syncState, nutritionEstimates } = await import("../../src/db/schema");
  const { bootstrap, pullChanges, pushOperations } = await import("../../src/modules/sync/service");
  const { syncPushSchema } = await import("../../src/modules/sync/dto");
  const { getNutritionTargets, storeNutritionEstimate } = await import("../../src/modules/nutrition/storage");
  const { FORMULA_VERSION, MAINTENANCE_FORMULA_VERSION } = await import("../../src/modules/nutrition/estimate");
  const { getMealCatalog, listMeals, mealsQuerySchema } = await import("../../src/modules/meals/service");
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
  function operation(entityType: "profile" | "meal_entry", entityId: string, baseVersion: string, payload: unknown) {
    return { action: "upsert", operationId: randomUUID(), entityType, entityId, baseVersion, payload };
  }
  async function push(userId: string, operations: unknown[]) {
    return pushOperations(userId, syncPushSchema.parse({ schemaVersion: 1, deviceId: "nutrition-test", operations }));
  }
  const date = "2026-10-11";
  const query = mealsQuerySchema.parse({ date, limit: 1 });
  try {
    const user = await createUser(), other = await createUser();
    assert.equal((await getNutritionTargets(user)).reason, "PROFILE_REQUIRED");
    const catalog = await getMealCatalog();
    assert.ok(catalog.total > 1000);
    assert.equal(catalog.meals.length, 50);
    assert.ok(catalog.meals.every((meal) => meal.sourceType === "reference"));
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
    const snapshot = await bootstrap(user);
    const legacy = { menuName: "Old meal", note: null, samplePriceRupiah: null, snapshot: {} };
    const demo = { ...legacy, catalogId: "demo-oats-banana-milk", servings: 1.5, consumedAt: "2026-10-11T01:00:00+07:00", recordedOn: date, mealType: "breakfast", nutrition: { caloriesKcal: 1, proteinGrams: 1 }, snapshot: { nutritionDetails: { sourceType: "reference" } } };
    const custom = { ...legacy, menuName: "Label-reported meal", catalogId: null, servings: 2, consumedAt: "2026-10-11T05:00:00Z", recordedOn: date, mealType: "lunch", nutrition: { caloriesKcal: 300, proteinGrams: 20 } };
    const mealCreate = operation("meal_entry", "demo-meal", "0", demo);
    assert.equal((await push(user, [mealCreate, operation("meal_entry", "custom-meal", "0", custom), operation("meal_entry", "legacy-meal", "0", legacy)])).results.every((r) => r.status === "applied"), true);
    assert.equal((await push(user, [mealCreate])).results[0].status, "duplicate");
    const initialPull = await pullChanges(user, snapshot.cursor, 100);
    const initialBootstrap = await bootstrap(user);
    assert.deepEqual(initialPull.changes.find((change) => change.entityId === "demo-meal")?.payload, initialBootstrap.entities.meal_entry.find((entry) => entry.entityId === "demo-meal")?.payload);
    const day = await listMeals(user, query);
    assert.equal(day.entries.length, 1);
    assert.equal(day.hasMore, true);
    assert.equal(day.summary.entryCount, 2);
    assert.deepEqual(day.summary.reportedTotals, { caloriesKcal: 600, proteinGrams: 40 });
    assert.deepEqual(day.summary.remaining, { caloriesKcal: 1670, proteinGrams: 110 });
    assert.deepEqual(day.summary.demoTotals, { caloriesKcal: 570, proteinGrams: 27 });
    assert.equal(day.summary.undatedLegacyEntryCount, 1);
    assert.equal((await listMeals(other, query)).summary.entryCount, 0);
    const secondPage = await listMeals(user, { ...query, offset: day.nextOffset! });
    assert.equal(secondPage.entries[0].caloriesKcal, 570);
    // Old client edits and malicious catalog nutrition cannot destroy historical per-serving data.
    assert.equal((await push(user, [operation("meal_entry", "demo-meal", "1", { ...legacy, note: "Edited by old app" })])).results[0].status, "applied");
    assert.deepEqual((await listMeals(user, query)).summary.demoTotals, { caloriesKcal: 570, proteinGrams: 27 });
    const pulled = await pullChanges(user, snapshot.cursor, 100);
    const fresh = await bootstrap(user);
    const lastDemo = pulled.changes.filter((change) => change.entityId === "demo-meal").at(-1);
    assert.deepEqual(lastDemo?.payload, fresh.entities.meal_entry.find((entry) => entry.entityId === "demo-meal")?.payload);
    for (const invalid of [{ ...demo, catalogId: "not-found" }, { ...demo, recordedOn: "2026-09-01" }, { ...legacy, servings: 1 }]) {
      assert.equal((await push(user, [operation("meal_entry", randomUUID(), "0", invalid)])).results[0].status, "rejected");
    }
    const deleted = await push(user, [{ action: "delete", entityType: "meal_entry", entityId: "custom-meal", baseVersion: "1", operationId: randomUUID() }]);
    assert.equal(deleted.results[0].status, "applied");
    assert.deepEqual((await listMeals(user, query)).summary.reportedTotals, { caloriesKcal: 0, proteinGrams: 0 });
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
      { entityType: "meal_entry", entityId: "imported-meal", payload: demo },
    ] });
    await importDemo(importer, request);
    assert.equal((await getNutritionTargets(importer)).estimate?.calories, 2200);
    assert.equal((await listMeals(importer, query)).summary.demoTotals.caloriesKcal, 570);
    assert.equal((await importDemo(importer, request)).duplicate, true);
    const rollbackUser = await createUser();
    await assert.rejects(() => importDemo(rollbackUser, demoImportSchema.parse({ ...request, importId: randomUUID(), entities: [request.entities[0], { ...request.entities[1], payload: { ...demo, catalogId: "missing" } }] })));
    assert.equal((await getNutritionTargets(rollbackUser)).reason, "PROFILE_REQUIRED");
    assert.equal((await db.select().from(nutritionEstimates).where(eq(nutritionEstimates.userId, rollbackUser))).length, 0);

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
    assert.equal((await listMeals(goalUser, query)).summary.remaining, null);

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
    console.info("Nutrition/meals integration test passed");
  } finally {
    if (ids.length) await db.delete(users).where(inArray(users.id, ids));
    await getPool().end();
  }
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
