import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { eq } from "drizzle-orm";
import { mealCatalogQuerySchema } from "../../src/modules/meals/query";
import { foodGroups } from "../../src/modules/meals/types";

loadEnvConfig(process.cwd());
process.env.SYNC_CURSOR_SECRET = "food-catalog-integration-secret-at-least-32-characters";

async function main() {
  const { getDatabase, getPool } = await import("../../src/db/client");
  const { users, syncState } = await import("../../src/db/schema");
  const { getMealCatalog, listMeals, mealsQuerySchema } = await import("../../src/modules/meals/service");
  const { pushOperations, bootstrap } = await import("../../src/modules/sync/service");
  const { syncPushSchema } = await import("../../src/modules/sync/dto");
  const route = await import("../../app/api/v1/catalog/meals/route");
  const db = getDatabase();
  let userId: string | undefined;
  const query = (value: Record<string, string> = {}) => mealCatalogQuerySchema.parse(value);
  try {
    const catalog = await getMealCatalog();
    assert.equal(catalog.total, 1145);
    assert.equal(catalog.meals.length, 50);
    assert.equal(catalog.hasMore, true);
    assert.equal(catalog.nextOffset, 50);
    assert.ok(catalog.meals.every((food) => food.sourceType === "reference"));
    const all: typeof catalog.meals = [];
    for (let offset = 0; offset < catalog.total; offset += 100) {
      all.push(...(await getMealCatalog(query({ offset: String(offset), limit: "100" }))).meals);
    }
    assert.equal(new Set(all.map((food) => food.id)).size, 1145);
    assert.equal(new Set(all.map((food) => food.foodGroup)).size, 13);
    assert.ok(all.every((food) => food.portionGrams === 100 && food.sourceDetails?.pdfPage && food.sourceCheckedAt === "2026-10-17"));
    for (const group of foodGroups) assert.ok((await getMealCatalog(query({ foodGroup: group }))).total > 0);
    const rice = (await getMealCatalog(query({ q: "AP001" }))).meals[0];
    assert.equal(rice.id, "tkpi-ap001");
    assert.equal(rice.caloriesKcal, 180);
    assert.equal(rice.proteinGrams, 3);
    assert.equal(rice.carbohydrateGrams, 39.8);
    assert.equal(rice.sourceDetails?.pdfPage, 17);
    assert.equal((await getMealCatalog(query({ q: "tempe", foodGroup: "legumes" }))).total > 0, true);
    assert.equal((await getMealCatalog(query({ q: "MP013" }))).total, 0);
    assert.equal((await getMealCatalog(query({ includeDemo: "true" }))).total, 1148);
    assert.equal((await getMealCatalog(query({ q: "%" }))).total, 0);
    assert.equal((await getMealCatalog(query({ q: "' OR 1=1 --" }))).total, 0);
    assert.equal((await getMealCatalog(query({ offset: "1145" }))).hasMore, false);
    const response = await route.GET(new Request("http://localhost/api/v1/catalog/meals?q=AP001"));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.equal((await response.json()).meals[0].id, rice.id);
    assert.equal((await route.GET(new Request("http://localhost/api/v1/catalog/meals?limit=101"))).status, 400);
    assert.equal((await route.GET(new Request("http://localhost/api/v1/catalog/meals?q=a&q=b"))).status, 400);

    const [user] = await db.insert(users).values({ issuer: `test://food-catalog/${randomUUID()}`, subject: randomUUID() }).returning();
    userId = user.id;
    await db.insert(syncState).values({ userId });
    const base = { menuName: "Client forged name", note: null, samplePriceRupiah: 1, snapshot: { nutritionDetails: { sourceType: "demo" } },
      catalogId: rice.id, servings: 1.5, consumedAt: "2026-10-17T07:00:00+07:00", recordedOn: "2026-10-17", mealType: "breakfast",
      nutrition: { caloriesKcal: 1, proteinGrams: 1, carbohydrateGrams: 999, fatGrams: 999 } };
    const operationId = randomUUID();
    const push = (baseVersion: string, payload: unknown, id = randomUUID()) => pushOperations(user.id, syncPushSchema.parse({ schemaVersion: 1, deviceId: "food-catalog-test", operations: [
      { operationId: id, action: "upsert", entityType: "meal_entry", entityId: "rice-test", baseVersion, payload },
    ] }));
    assert.equal((await push("0", base, operationId)).results[0].status, "applied");
    assert.equal((await push("0", base, operationId)).results[0].status, "duplicate");
    const dateQuery = mealsQuerySchema.parse({ date: "2026-10-17" });
    const day = await listMeals(user.id, dateQuery);
    assert.equal(day.entries[0].menuName, "Nasi");
    assert.equal(day.entries[0].samplePriceRupiah, null);
    assert.equal(day.entries[0].nutritionPerServing?.carbohydrateGrams, 39.8);
    assert.deepEqual(day.summary.reportedTotals, { caloriesKcal: 270, proteinGrams: 4.5 });
    assert.equal(day.summary.demoEntryCount, 0);
    const details = day.entries[0].snapshot.nutritionDetails as Record<string, unknown>;
    assert.equal(details.sourceCode, "AP001");
    assert.equal(details.portionGrams, 100);
    assert.deepEqual(details.sourceDetails, rice.sourceDetails);
    assert.deepEqual(details.total, { caloriesKcal: 270, proteinGrams: 4.5, carbohydrateGrams: 59.7, fatGrams: 0.45, fiberGrams: 0.3, sodiumMg: 1.5 });
    assert.equal((await push("1", { ...base, note: "Edited", servings: 2 })).results[0].status, "applied");
    const edited = await listMeals(user.id, dateQuery);
    assert.equal(edited.entries[0].nutritionPerServing?.carbohydrateGrams, 39.8);
    assert.equal(edited.entries[0].caloriesKcal, 360);
    assert.deepEqual((edited.entries[0].snapshot.nutritionDetails as Record<string, unknown>).sourceDetails, details.sourceDetails);
    const syncedPayload = (await bootstrap(user.id)).entities.meal_entry[0].payload as Record<string, unknown>;
    assert.equal((syncedPayload.nutrition as { carbohydrateGrams: number }).carbohydrateGrams, 39.8);
    console.info("Food catalog integration passed: 1145 persisted reference foods, 13 groups, source metadata, search/pagination and authoritative portion logging");
  } finally {
    if (userId) await db.delete(users).where(eq(users.id, userId));
    await getPool().end();
  }
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
