import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "../../src/db/client";
import * as schema from "../../src/db/schema";
import { matchesEquipmentCategory, matchesMuscleTargets, musclesByBodyPart } from "../../src/modules/catalog/exercise-query";
import { muscleAreas } from "../../src/modules/workouts/measurement";
import * as route from "../../app/api/v1/catalog/exercises/route";
import * as muscleRoute from "../../app/api/v1/catalog/muscles/route";

test("equipment category checks alternatives and matches mobile categories", () => {
  const groups = [["dumbbell", "bench"], ["cable_machine"], []];
  for (const category of ["all", "dumbbell", "cable", "no_equipment"] as const) assert.equal(matchesEquipmentCategory(groups, category), true);
  assert.equal(matchesEquipmentCategory(groups, "machine"), false);
  assert.equal(matchesEquipmentCategory([["lat_pulldown_machine"]], "cable"), true);
  assert.equal(matchesEquipmentCategory([["lat_pulldown_standard_machine"]], "machine"), true);
  assert.equal(matchesEquipmentCategory([["lat_pulldown_plate_loaded_machine"]], "plate"), true);
  assert.equal(matchesEquipmentCategory([["lat_pulldown_plate_loaded_machine"]], "machine"), false);
});

test("muscle grouping is exhaustive and filtering respects primary and secondary targets", () => {
  const allAreas = [...musclesByBodyPart.upper_body, ...musclesByBodyPart.lower_body];
  assert.equal(new Set(allAreas).size, muscleAreas.length);
  assert.deepEqual([...allAreas].sort(), [...muscleAreas].sort());
  const targets = { version: "1" as const, primary: ["chest" as const], secondary: ["triceps" as const, "glutes" as const] };
  assert.ok(matchesMuscleTargets(targets, { bodyPart: "upper_body", muscle: "chest" }));
  assert.equal(matchesMuscleTargets(targets, { muscle: "triceps" }), false);
  assert.ok(matchesMuscleTargets(targets, { muscle: "triceps", muscleRole: "any" }));
  assert.ok(matchesMuscleTargets(targets, { muscles: ["chest", "glutes"] }));
  assert.equal(matchesMuscleTargets(targets, { muscles: ["glutes", "biceps"] }), false);
  assert.ok(matchesMuscleTargets(targets, { bodyPart: "lower_body", muscleRole: "secondary" }));
  assert.equal(matchesMuscleTargets(targets, { bodyPart: "lower_body" }), false);
  assert.equal(matchesMuscleTargets(null, { muscle: "chest" }), false);
  assert.equal(matchesMuscleTargets(null, {}), true);
});

test("muscle catalog exposes all canonical areas grouped with localized labels", async () => {
  const response = await muscleRoute.GET(new Request("http://localhost/api/v1/catalog/muscles"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.catalogVersion, "1");
  assert.deepEqual(body.groups.map((group: { id: string }) => group.id), ["upper_body", "lower_body"]);
  for (const group of body.groups) {
    assert.deepEqual(group.muscles.map((muscle: { id: string }) => muscle.id), musclesByBodyPart[group.id as keyof typeof musclesByBodyPart]);
    assert.ok(group.idLabel && group.enLabel);
    assert.ok(group.muscles.every((muscle: { id: string; idLabel: string; enLabel: string }) => muscle.idLabel && muscle.enLabel && muscleAreas.includes(muscle.id as typeof muscleAreas[number])));
  }
  assert.equal((await muscleRoute.GET(new Request("http://localhost/api/v1/catalog/muscles?unknown=1"))).status, 400);
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
    assert.equal(all.body.exercises.length, 141);
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
    for (const part of ["upper_body", "lower_body"] as const) {
      const body = await get(`?bodyPart=${part}`);
      const expected = all.body.exercises.filter((item: { muscleTargets: { primary: string[] } | null }) => item.muscleTargets?.primary.some(muscle => (musclesByBodyPart[part] as readonly string[]).includes(muscle)));
      assert.deepEqual(body.body.exercises, expected);
      assert.ok(expected.length > 0);
    }
    const chest = await get("?bodyPart=upper_body&muscle=chest&equipment=dumbbell&mode=gym");
    assert.ok(chest.body.exercises.some((item: { id: string }) => item.id === "flat_dumbbell_bench_press"));
    assert.ok(chest.body.exercises.every((item: { muscleTargets: { primary: string[] }; mode: string; requirements: string[][] }) => item.mode === "gym" && item.muscleTargets.primary.includes("chest") && item.requirements.some(group => group.includes("dumbbell"))));
    const primary = await get("?muscle=triceps");
    const any = await get("?muscle=triceps&muscleRole=any");
    const secondary = await get("?muscle=triceps&muscleRole=secondary");
    assert.ok(any.body.exercises.length > primary.body.exercises.length);
    assert.ok(secondary.body.exercises.some((item: { id: string }) => item.id === "flat_dumbbell_bench_press"));
    assert.equal((await get("?bodyPart=lower_body&muscle=calves")).response.status, 200);
    const multi = await get("?muscles=chest,quadriceps");
    const expectedMulti = all.body.exercises.filter((item: { muscleTargets: { primary: string[] } | null }) => item.muscleTargets?.primary.some(muscle => ["chest", "quadriceps"].includes(muscle)));
    assert.deepEqual(multi.body.exercises, expectedMulti);
    assert.ok(multi.body.exercises.some((item: { id: string }) => item.id === "flat_dumbbell_bench_press"));
    assert.ok((await get("?bodyPart=upper_body&muscles=chest,triceps&equipment=dumbbell")).body.exercises.length > 0);
    assert.deepEqual((await get("?muscles=chest")).body, (await get("?muscle=chest")).body);
    for (const query of ["?equipment=barbell", "?equipment=", "?mode=bad", "?equipment=plate&equipment=cable", "?other=x", "?equipmentIds=dumbbell,dumbbell", "?equipmentIds=unknown", "?bodyPart=upper", "?muscle=unknown", "?muscleRole=all", "?bodyPart=upper_body&muscle=calves", "?muscle=chest&muscle=triceps", "?muscles=", "?muscles=chest,chest", "?muscles=chest,unknown", "?muscle=chest&muscles=chest", "?bodyPart=upper_body&muscles=chest,calves"]) {
      assert.equal((await get(query)).response.status, 400, query);
    }
  } finally { globals.musmoveDatabase = previous; await local.close(); }
});
