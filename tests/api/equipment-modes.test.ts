import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Database } from "../../src/db/client";
import * as schema from "../../src/db/schema";
import { getEquipmentCatalog, getEquipmentExercises } from "../../src/modules/equipment/service";
import * as route from "../../app/api/v1/catalog/equipment/route";

const shared = ["bench", "chair", "mat", "parallel_bars", "pull_up_bar", "resistance_band"];
const calisthenicsOnly = ["low_bar", "rings"];

test("Every persisted equipment is classified; migration preserves IDs/aliases and filters database-backed APIs", async () => {
  const savedEnv = { ...process.env }, savedFetch = globalThis.fetch;
  const globalDb = globalThis as unknown as { musmoveDatabase?: Database; musmovePool?: unknown };
  const previousDb = globalDb.musmoveDatabase, previousPool = globalDb.musmovePool;
  const local = new PGlite();
  Object.assign(process.env, { NODE_ENV: "test" }); delete process.env.VERCEL;
  globalDb.musmovePool = { query() { throw new Error("Live database forbidden"); } };
  globalThis.fetch = async () => { throw new Error("Network forbidden"); };
  try {
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
    const index = migrations.findIndex(m => m.folderMillis === 1791657682441);
    assert.ok(index > 0);
    for (const migration of migrations.slice(0, index)) for (const statement of migration.sql) await local.exec(statement);
    const before = (await local.query("SELECT id,name,aliases,active FROM equipment_catalog ORDER BY id")).rows;
    const version = (await local.query<{ version: string }>("SELECT version::text FROM catalog_state WHERE name='equipment'")).rows[0].version;
    for (const statement of migrations[index].sql) await local.exec(statement);
    assert.deepEqual((await local.query("SELECT id,name,aliases,active FROM equipment_catalog ORDER BY id")).rows, before);
    assert.equal(BigInt((await local.query<{ version: string }>("SELECT version::text FROM catalog_state WHERE name='equipment'")).rows[0].version), BigInt(version) + BigInt(1));
    for (const migration of migrations.slice(index + 1)) for (const statement of migration.sql) await local.exec(statement);
    globalDb.musmoveDatabase = drizzle(local, { schema }) as unknown as Database;
    const catalog = await getEquipmentCatalog(); assert.equal(catalog.equipment.length, 39);
    for (const item of catalog.equipment) {
      assert.deepEqual(item.modes, shared.includes(item.id) ? ["gym", "calisthenics"] : calisthenicsOnly.includes(item.id) ? ["calisthenics"] : ["gym"]);
    }
    assert.equal((await getEquipmentCatalog(undefined, "gym")).equipment.length, 37);
    assert.equal((await getEquipmentCatalog(undefined, "calisthenics")).equipment.length, 8);
    assert.equal((await getEquipmentCatalog("dambel", "calisthenics")).matchType, "no_match");
    assert.deepEqual((await getEquipmentCatalog("dambel", "gym")).equipment[0].modes, ["gym"]);
    assert.deepEqual((await getEquipmentExercises(["pull_up_bar"], "calisthenics")).selectedEquipment[0].modes, ["gym", "calisthenics"]);
    assert.ok((await getEquipmentExercises(["dumbbell", "bench"], "gym")).ready.some(e => e.id === "flat_dumbbell_bench_press"));
    const incompatible = await local.query(`SELECT DISTINCT equipment.id, exercise.mode FROM exercise_catalog exercise
      CROSS JOIN LATERAL jsonb_array_elements(exercise.requirements) option_group
      CROSS JOIN LATERAL jsonb_array_elements_text(option_group.value) requirement(id)
      JOIN equipment_catalog equipment ON equipment.id=requirement.id
      WHERE NOT (equipment.modes @> ARRAY[exercise.mode]::text[])`);
    assert.deepEqual(incompatible.rows, [], "No existing exercise loses its equipment classification");
    for (const value of ["NULL", "'{}'::text[]", "ARRAY['other']", "ARRAY['gym','gym']", "ARRAY['gym',NULL]", "ARRAY['calisthenics','gym']", "ARRAY[['gym']]"]) {
      await assert.rejects(local.exec(`UPDATE equipment_catalog SET modes=${value} WHERE id='dumbbell'`));
    }
    await assert.rejects(local.exec("INSERT INTO equipment_catalog(id,name,aliases) VALUES('unclassified','Unclassified',ARRAY['unclassified'])"));
    const response = await route.GET(new Request("http://localhost/api/v1/catalog/equipment?mode=calisthenics&q=bar"));
    assert.equal(response.status, 200);
    const body = await response.json(); assert.ok(body.equipment.length > 0);
    assert.ok(body.equipment.every((e: { modes: string[] }) => e.modes.includes("calisthenics")));
    assert.equal((await route.GET(new Request("http://localhost/api/v1/catalog/equipment?mode=both"))).status, 400);
    assert.equal((await route.GET(new Request("http://localhost/api/v1/catalog/equipment?mode=gym&mode=calisthenics"))).status, 400);
    assert.match(response.headers.get("cache-control")!, /no-store/);
  } finally {
    globalDb.musmoveDatabase = previousDb; globalDb.musmovePool = previousPool; globalThis.fetch = savedFetch;
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv); await local.close();
  }
});
