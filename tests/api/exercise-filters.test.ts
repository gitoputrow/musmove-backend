import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "../../src/db/client";
import * as schema from "../../src/db/schema";
import { matchesEquipmentCategory } from "../../src/modules/catalog/exercise-query";
import * as route from "../../app/api/v1/catalog/exercises/route";

test("equipment category checks alternatives and matches mobile categories", () => {
  const groups = [["dumbbell", "bench"], ["cable_machine"], []];
  for (const category of ["all", "dumbbell", "cable", "no_equipment"] as const) assert.equal(matchesEquipmentCategory(groups, category), true);
  assert.equal(matchesEquipmentCategory(groups, "machine"), false);
  assert.equal(matchesEquipmentCategory([["lat_pulldown_machine"]], "cable"), true);
  assert.equal(matchesEquipmentCategory([["lat_pulldown_standard_machine"]], "machine"), true);
  assert.equal(matchesEquipmentCategory([["lat_pulldown_plate_loaded_machine"]], "plate"), true);
  assert.equal(matchesEquipmentCategory([["lat_pulldown_plate_loaded_machine"]], "machine"), false);
});

test("exercise endpoint filters category, mode and equipment IDs, validates query and keeps response shape", async () => {
  const local = new PGlite();
  const db = drizzle(local, { schema });
  const globals = globalThis as unknown as { musmoveDatabase?: Database };
  const previous = globals.musmoveDatabase;
  try {
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "drizzle", migrationsTable: "migrations" });
    globals.musmoveDatabase = db as unknown as Database;
    async function get(query = "") { const response = await route.GET(new Request(`http://localhost/api/v1/catalog/exercises${query}`)); return { response, body: await response.json() }; }
    const all = await get();
    assert.equal(all.response.status, 200);
    assert.equal(all.body.exercises.length, 128);
    assert.deepEqual((await get("?equipment=all")).body, all.body);
    for (const [category, id] of [["dumbbell", "flat_dumbbell_bench_press"], ["cable", "lat_pulldown_cable_machine"], ["machine", "lat_pulldown_machine"], ["plate", "lat_pulldown_plate_loaded"], ["no_equipment", "pushup"]]) {
      const result = await get(`?equipment=${category}`);
      assert.equal(result.response.status, 200);
      assert.ok(result.body.exercises.some((item: { id: string }) => item.id === id), `${category} ${id}`);
      assert.equal(result.body.catalogVersion, all.body.catalogVersion);
    }
    const combined = await get("?equipment=plate&mode=gym&equipmentIds=lat_pulldown_plate_loaded_machine");
    assert.deepEqual(combined.body.exercises.map((item: { id: string }) => item.id), ["lat_pulldown_plate_loaded"]);
    const cable = await get("?equipment=cable");
    assert.ok(!cable.body.exercises.some((item: { id: string }) => item.id === "lat_pulldown_machine"));
    for (const query of ["?equipment=barbell", "?equipment=", "?mode=bad", "?equipment=plate&equipment=cable", "?other=x", "?equipmentIds=dumbbell,dumbbell", "?equipmentIds=unknown"]) {
      assert.equal((await get(query)).response.status, 400, query);
    }
  } finally { globals.musmoveDatabase = previous; await local.close(); }
});
