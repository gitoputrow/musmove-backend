import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { curateAdditionalNutrients, loadTkpiSnapshot } from "../../scripts/tkpi-data";
import { parseMealCatalogQuery } from "../../src/modules/meals/query";
import { mealTotals } from "../../src/modules/meals/resolve";
import { foodGroups } from "../../src/modules/meals/types";
import { entityPayloadSchemas } from "../../src/modules/sync/dto";

test("Official source snapshot covers all TKPI rows and preserves missing/estimated values", async () => {
  const source = await loadTkpiSnapshot();
  const snapshotBytes = await readFile("src/db/data/tkpi-2017.json");
  assert.equal(createHash("sha256").update(snapshotBytes).digest("hex"), "dd204189b487644d3db831ff2b02246fdebb6a1677acf8ec477f46b0f8bf072f", "Source snapshot facts must not drift without explicit review");
  assert.equal(source.sourceSha256, "12433fb4803c47ecbc89dc5981e3ee80717313ccf1b756b8189ebffca4e1d382");
  assert.equal(source.sourceUrl, "https://repository.kemkes.go.id/book/777");
  assert.equal(source.nutrientBasisGrams, 100);
  assert.equal(source.foods.length, 1146);
  assert.equal(new Set(source.foods.map((food) => food.foodGroup)).size, foodGroups.length);
  const missing = source.foods.filter((food) => food.nutrients.caloriesKcal === null || food.nutrients.proteinGrams === null);
  assert.deepEqual(missing.map((food) => food.code), ["MP013"]);
  for (const food of source.foods) {
    assert.equal(food.pdfPage - food.printedPage, 7);
    assert.equal(Object.keys(food.nutrients).length, 21);
    for (const field of food.imputedOrBorrowedFields) assert.notEqual(food.nutrients[field], null);
  }
  const get = (code: string) => source.foods.find((food) => food.code === code)!;
  assert.deepEqual([get("AP001").nutrients.caloriesKcal, get("AP001").nutrients.proteinGrams, get("AP001").nutrients.carbohydrateGrams], [180, 3, 39.8]);
  assert.deepEqual([get("AP005").nutrients.caloriesKcal, get("AP005").nutrients.proteinGrams], [149, 2.8]);
  assert.deepEqual([get("CP077").nutrients.caloriesKcal, get("CP077").nutrients.proteinGrams], [201, 20.8]);
  assert.equal(get("CP017").nutrients.sodiumMg, null);
  assert.equal(get("AP002").nutrients.sodiumMg, 0);
  assert.ok(get("AP005").imputedOrBorrowedFields.includes("sodiumMg"));
  assert.equal(get("AP001").enLabel, null, "Do not invent translations absent from the source index");
});

test("Suspicious source micronutrients are withheld without modifying original facts", async () => {
  const { foods } = await loadTkpiSnapshot();
  const bongkrek = foods.find((food) => food.code === "CP070")!;
  const curated = curateAdditionalNutrients(bongkrek);
  assert.equal(bongkrek.nutrients.ashGrams, 146.3);
  assert.equal(curated.additionalNutrients.ashGrams, null);
  assert.deepEqual(curated.withheldNutrients.ashGrams, { sourceValue: 146.3, reason: "SOURCE_OUTLIER_REQUIRES_REVIEW" });
  const flour = curateAdditionalNutrients(foods.find((food) => food.code === "CP086")!);
  assert.equal(flour.additionalNutrients.copperMg, null);
  assert.equal(flour.withheldNutrients.copperMg.sourceValue, 4303.45);
  assert.equal(foods.filter((food) => Object.keys(curateAdditionalNutrients(food).withheldNutrients).length).length, 20);
});

test("Catalog query is bounded and rejects duplicate, unknown or ambiguous options", () => {
  assert.deepEqual(parseMealCatalogQuery("http://localhost/api/v1/catalog/meals"), { includeDemo: false, limit: 50, offset: 0 });
  assert.equal(parseMealCatalogQuery("http://localhost/?includeDemo=false").includeDemo, false);
  assert.equal(parseMealCatalogQuery("http://localhost/?q=tempe&foodGroup=legumes&limit=20").limit, 20);
  for (const params of ["q=", "limit=0", "limit=101", "limit=1e2", "offset=-1", "offset=100001", "includeDemo=1", "foodGroup=wrong", "limit=2&limit=3", "q=a&q=b", "userId=123", "__proto__=bad"]) {
    assert.throws(() => parseMealCatalogQuery(`http://localhost/?${params}`));
  }
});

test("Reference nutrients scale by weighed portion; unknown values stay null", () => {
  const nutrition = { caloriesKcal: 180, proteinGrams: 3, carbohydrateGrams: 39.8, fatGrams: 0.3, fiberGrams: null, sodiumMg: 1 };
  assert.deepEqual(mealTotals(nutrition, 1.5), { caloriesKcal: 270, proteinGrams: 4.5, carbohydrateGrams: 59.7, fatGrams: 0.45, fiberGrams: null, sodiumMg: 1.5 });
  const base = { menuName: null, note: null, samplePriceRupiah: null, snapshot: {}, nutrition };
  assert.ok(entityPayloadSchemas.meal_entry.safeParse(base).success);
  for (const value of [-1, Infinity, NaN, 100001]) {
    assert.equal(entityPayloadSchemas.meal_entry.safeParse({ ...base, nutrition: { ...nutrition, sodiumMg: value } }).success, false);
  }
});

test("Data migration is exactly reproducible from the pinned source snapshot", async () => {
  const generated = execFileSync(process.execPath, ["--import", "tsx", "scripts/build-tkpi-migration.ts"], { encoding: "utf8", maxBuffer: 2_000_000 });
  const migration = await readFile("drizzle/0014_reference_food_catalog.sql", "utf8");
  assert.equal(migration.slice(migration.indexOf("-- Generated from the official TKPI snapshot")), generated);
});

test("Fresh database persists every usable source row, provenance, and nullable nutrients", async () => {
  const client = new PGlite();
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle", migrationsSchema: "drizzle", migrationsTable: "migrations" });
    const result = await client.query<Record<string, unknown>>("SELECT * FROM meal_catalog WHERE source_type = 'reference' ORDER BY source_code");
    const source = await loadTkpiSnapshot();
    const usable = source.foods.filter((food) => food.nutrients.caloriesKcal !== null && food.nutrients.proteinGrams !== null);
    assert.equal(result.rows.length, 1145);
    const main = { caloriesKcal: "calories_kcal", proteinGrams: "protein_grams", carbohydrateGrams: "carbohydrate_grams", fatGrams: "fat_grams", fiberGrams: "fiber_grams", sodiumMg: "sodium_mg" };
    for (const [index, row] of result.rows.entries()) {
      const food = usable[index];
      assert.equal(row.id, `tkpi-${food.code.toLowerCase()}`);
      assert.equal(row.id_label, food.name);
      assert.equal(row.en_label, food.enLabel);
      assert.equal(row.source_code, food.code);
      assert.equal(row.food_group, food.foodGroup);
      assert.equal(row.food_kind, food.foodKind);
      assert.equal(Number(row.portion_grams), 100);
      assert.equal(row.meal_type, null);
      assert.equal(row.sample_price_rupiah, null);
      assert.equal(row.source_url, source.sourceUrl);
      for (const [field, column] of Object.entries(main)) {
        assert.equal(row[column] === null ? null : Number(row[column]), food.nutrients[field], `${food.code}/${field}`);
      }
      assert.deepEqual(row.source_details, { dataset: "TKPI_2017", pdfPage: food.pdfPage, printedPage: food.printedPage,
        originalReference: food.originalReference, ediblePercent: food.ediblePercent,
        imputedOrBorrowedFields: food.imputedOrBorrowedFields, ...curateAdditionalNutrients(food) });
    }
    assert.equal((await client.query("SELECT id FROM meal_catalog WHERE source_type = 'demo'")).rows.length, 3);
    for (const update of ["protein_grams = -1", "sodium_mg = -1", "portion_grams = 0", "source_details = '[]'::jsonb", "source_code = NULL", "food_group = 'unknown'"]) {
      await assert.rejects(client.exec(`UPDATE meal_catalog SET ${update} WHERE id = 'tkpi-ap001'`));
    }
    await assert.rejects(client.exec("UPDATE meal_catalog SET source_code = 'AP001' WHERE id = 'tkpi-ap005'"));
  } finally { await client.close(); }
});
