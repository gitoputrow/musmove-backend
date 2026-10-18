import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { eq } from "drizzle-orm";
import { buildFoodPrices } from "../../scripts/food-price-data";
import { foodPricesMigration } from "../../scripts/build-food-prices-migration";
import { foodPriceDetailsSchema, calculateFoodPrice } from "../../src/modules/meals/prices";
import { getMealCatalog, listMeals, mealsQuerySchema } from "../../src/modules/meals/service";
import { parseMealCatalogQuery } from "../../src/modules/meals/query";
import { pushOperations } from "../../src/modules/sync/service";
import { syncPushSchema } from "../../src/modules/sync/dto";
import type { Database } from "../../src/db/client";
import * as schema from "../../src/db/schema";

test("All 1145 foods have honest pricing metadata; exclusions are not free foods", async () => {
  const rows = await buildFoodPrices();
  assert.equal(rows.length, 1145); assert.equal(new Set(rows.map(row => row.id)).size, 1145);
  assert.equal(rows.filter(row => row.samplePriceRupiah !== null).length, 1125);
  assert.equal(rows.filter(row => row.priceDetails.status === "not_priced").length, 20);
  for (const row of rows) {
    assert.ok(foodPriceDetailsSchema.safeParse(row.priceDetails).success);
    if (row.priceDetails.status === "not_priced") { assert.equal(row.samplePriceRupiah, null); continue; }
    const d = row.priceDetails;
    assert.equal(row.samplePriceRupiah, calculateFoodPrice(d.reference, d.calculation));
    assert.ok(row.samplePriceRupiah! > 0 && Number.isSafeInteger(row.samplePriceRupiah));
    assert.equal(row.samplePriceRupiah! % 100, 0);
    assert.match(d.label, /Estimasi/); assert.equal(d.basisGrams, 100);
    assert.match(d.reference.sourceUrl, /^https:\/\//);
    if (d.method !== "reference_conversion") assert.equal(d.confidence, "low");
    if (d.reference.unit === "ml") assert.ok(d.assumptions.some(note => note.includes("massa jenis")));
    if (d.reference.sourceDate) assert.ok(d.reference.sourceDate <= d.reference.checkedAt);
  }
  assert.equal(rows.find(row => row.id === "tkpi-jr002")!.priceDetails.status, "not_priced");
  const oil = rows.find(row => row.id === "tkpi-kr012")!;
  assert.equal(oil.priceDetails.status === "estimated" && oil.priceDetails.calculation.sourceWeightGrams, 920);
  const rice = rows.find(row => row.id === "tkpi-ap001")!;
  assert.equal(rice.samplePriceRupiah, 1400);
  assert.equal(rice.priceDetails.status === "estimated" && rice.priceDetails.method, "ingredient_cost_model");
});

test("Checked-in price migration is exactly reproducible without a network or DB", async () => {
  assert.equal(await readFile("drizzle/0018_food_price_estimates.sql", "utf8"), await foodPricesMigration());
});

test("Price and catalog simplification rollouts preserve user history and expose server-owned estimates", async () => {
  Object.assign(process.env, { NODE_ENV: "test", SYNC_CURSOR_SECRET: "isolated-food-price-test-key-at-least-32-characters" });
  delete process.env.VERCEL;
  const local = new PGlite();
  const globalDb = globalThis as unknown as { musmoveDatabase?: Database; musmovePool?: unknown };
  const previous = globalDb.musmoveDatabase, previousPool = globalDb.musmovePool, savedFetch = globalThis.fetch;
  globalDb.musmovePool = { query() { throw new Error("Live DB forbidden"); } };
  globalThis.fetch = async () => { throw new Error("Network forbidden in food-price tests"); };
  try {
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
    const priceIndex = migrations.findIndex(migration => migration.folderMillis === 1791657682439);
    assert.ok(priceIndex >= 0);
    for (const migration of migrations.slice(0, priceIndex)) for (const statement of migration.sql) await local.exec(statement);
    const userId = randomUUID();
    await local.query("INSERT INTO users(id,issuer,subject) VALUES ($1,'test://food-prices','synthetic')", [userId]);
    await local.query("INSERT INTO sync_state(user_id) VALUES ($1)", [userId]);
    await local.query(`INSERT INTO meal_entries(user_id,id,menu_name,sample_price_rupiah,snapshot,
      catalog_id,servings,consumed_at,recorded_on,meal_type,nutrition_per_serving,calories_kcal,protein_grams)
      VALUES ($1,'old-meal','Historical meal',12345,
      '{"privateNote":"unchanged","nutritionDetails":{"portionLabel":"old serving","foodKind":"single"}}',
      'tkpi-ap001',1,'2026-10-17T07:00:00+07:00','2026-10-17','breakfast','{"caloriesKcal":180,"proteinGrams":3}',180,3)`, [userId]);
    const history = (await local.query("SELECT to_jsonb(m) AS record FROM meal_entries m WHERE id='old-meal'")).rows;
    const nutritionBefore = (await local.query("SELECT id,calories_kcal,protein_grams,carbohydrate_grams,fat_grams,fiber_grams,sodium_mg,source_details FROM meal_catalog ORDER BY id")).rows;
    const catalogBefore = (await local.query<{ version: string }>("SELECT version::text AS version FROM catalog_state WHERE name='meals'")).rows[0].version;
    await local.exec("BEGIN");
    for (const statement of migrations[priceIndex].sql) await local.exec(statement);
    await local.exec("COMMIT");
    assert.deepEqual((await local.query("SELECT to_jsonb(m) AS record FROM meal_entries m WHERE id='old-meal'")).rows, history);
    assert.deepEqual((await local.query("SELECT id,calories_kcal,protein_grams,carbohydrate_grams,fat_grams,fiber_grams,sodium_mg,source_details FROM meal_catalog ORDER BY id")).rows, nutritionBefore);
    assert.ok(BigInt((await local.query<{ version: string }>("SELECT version::text AS version FROM catalog_state WHERE name='meals'")).rows[0].version) > BigInt(catalogBefore));

    const db = drizzle(local, { schema }); globalDb.musmoveDatabase = db as unknown as Database;
    // New code must work before production DROP COLUMN, allowing deployment first.
    const beforeDrop = await getMealCatalog();
    for (const row of beforeDrop.meals) for (const field of ["mealType", "portionLabel", "foodKind"]) assert.equal(Object.hasOwn(row, field), false);
    const remainingBefore = (await local.query("SELECT to_jsonb(m) - 'meal_type' - 'portion_label' - 'food_kind' AS record FROM meal_catalog m ORDER BY id")).rows;
    const versionBeforeDrop = (await local.query<{ version: string }>("SELECT version::text FROM catalog_state WHERE name='meals'")).rows[0].version;
    const simplify = migrations[priceIndex + 1];
    assert.equal(simplify.folderMillis, 1791657682440);
    await local.exec("BEGIN");
    for (const statement of simplify.sql) await local.exec(statement);
    await local.exec("COMMIT");
    assert.deepEqual((await local.query("SELECT to_jsonb(m) AS record FROM meal_catalog m ORDER BY id")).rows, remainingBefore);
    assert.deepEqual((await local.query("SELECT to_jsonb(m) AS record FROM meal_entries m WHERE id='old-meal'")).rows, history);
    assert.equal(BigInt((await local.query<{ version: string }>("SELECT version::text FROM catalog_state WHERE name='meals'")).rows[0].version), BigInt(versionBeforeDrop) + BigInt(1));
    const columns = (await local.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='meal_catalog'")).rows;
    assert.equal(columns.length, 22);
    for (const removed of ["meal_type", "portion_label", "food_kind"]) assert.equal(columns.some(column => column.column_name === removed), false);
    for (const migration of migrations.slice(priceIndex + 2)) for (const statement of migration.sql) await local.exec(statement);
    const tofu = (await getMealCatalog(parseMealCatalogQuery("http://localhost/?q=CP061"))).meals[0];
    assert.equal(tofu.samplePriceRupiah, 1900); assert.equal(tofu.priceDetails?.status, "estimated");
    const all = await getMealCatalog(); assert.equal(all.total, 1145);
    assert.ok(all.warnings.includes("FOOD_PRICES_ARE_ESTIMATES_PER_100G_EDIBLE_NOT_LIVE_OFFERS"));
    const api = await import("../../app/api/v1/catalog/meals/route");
    const response = await api.GET(new Request("http://localhost/api/v1/catalog/meals?q=CP061"));
    assert.equal(response.status, 200); assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.deepEqual((await response.json()).meals[0].priceDetails, tofu.priceDetails);
    assert.equal((await api.GET(new Request("http://localhost/api/v1/catalog/meals?foodKind=single"))).status, 400);
    for (const field of ["mealType", "portionLabel", "foodKind"]) assert.equal(Object.hasOwn(tofu, field), false);
    const base = { menuName: "forged name", note: null, samplePriceRupiah: 1,
      snapshot: { nutritionDetails: { priceDetails: { status: "verified", reference: "forged" } } },
      catalogId: tofu.id, servings: 1.5, consumedAt: "2026-10-18T07:00:00+07:00", recordedOn: "2026-10-18", mealType: "breakfast" };
    const push = (baseVersion: string, payload: unknown) => pushOperations(userId, syncPushSchema.parse({ schemaVersion: 1, deviceId: "price-test", operations: [
      { operationId: randomUUID(), entityType: "meal_entry", entityId: "priced-tofu", action: "upsert", baseVersion, payload },
    ] }));
    assert.equal((await push("0", base)).results[0].status, "applied");
    const query = mealsQuerySchema.parse({ date: "2026-10-18" });
    const first = (await listMeals(userId, query)).entries[0];
    assert.equal(first.samplePriceRupiah, 1900); // Per catalog serving, NOT multiplied by 1.5.
    assert.deepEqual((first.snapshot.nutritionDetails as Record<string, unknown>).priceDetails, tofu.priceDetails);
    assert.equal(first.menuName, "Tahu, mentah");
    assert.equal(first.mealType, "breakfast");
    for (const field of ["portionLabel", "foodKind"]) assert.equal(Object.hasOwn(first.snapshot.nutritionDetails as object, field), false);
    assert.ok(tofu.priceDetails && tofu.priceDetails.status === "estimated");
    const newPriceDetails = { ...tofu.priceDetails, reference: { ...tofu.priceDetails.reference, priceRupiah: 12000 } };
    await db.update(schema.mealCatalog).set({ samplePriceRupiah: calculateFoodPrice(newPriceDetails.reference, newPriceDetails.calculation), priceDetails: newPriceDetails }).where(eq(schema.mealCatalog.id, tofu.id));
    assert.equal((await push("1", { ...base, note: "Edited later", servings: 2 })).results[0].status, "applied");
    const later = (await listMeals(userId, query)).entries[0];
    assert.equal(later.samplePriceRupiah, 1900);
    assert.deepEqual((later.snapshot.nutritionDetails as Record<string, unknown>).priceDetails, tofu.priceDetails);
    for (const update of ["price_details=NULL", "price_details='{}'", "price_details=jsonb_set(price_details,'{currency}','\"USD\"')", "price_details=jsonb_set(price_details,'{basisGrams}','1')", "sample_price_rupiah=0", "sample_price_rupiah=NULL"]) {
      await local.exec("BEGIN");
      await assert.rejects(local.exec(`UPDATE meal_catalog SET ${update} WHERE id='tkpi-cp061'`));
      await local.exec("ROLLBACK");
    }
    await assert.rejects(local.exec("UPDATE meal_catalog SET sample_price_rupiah=100 WHERE id='tkpi-jr002'"));
  } finally {
    globalDb.musmoveDatabase = previous; globalDb.musmovePool = previousPool; globalThis.fetch = savedFetch;
    await local.close();
  }
});
