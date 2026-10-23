import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { focusAreasSchema, readFocusAreas, resolveFocusFields, distributeFocusPrograms } from "../../src/modules/programs/focus";
import { completeOnboardingSchema } from "../../src/modules/onboarding/dto";
import { accountPatchSchema, profilePatchSchema } from "../../src/modules/online/dto";
import { parseEntityPayload } from "../../src/modules/sync/dto";

test("focus choices validate type/duplicates/exclusivity and normalize in a fixed non-priority order", () => {
  for (const areas of [[], ["full"], ["chest"], ["arm", "back", "chest", "leg"]]) assert.equal(focusAreasSchema.safeParse(areas).success, true);
  for (const areas of [null, "chest", [""], ["shoulder"], [1], ["full", "chest"], ["chest", "chest"], ["leg", "chest", "back", "arm", "full"]]) {
    assert.equal(focusAreasSchema.safeParse(areas).success, false);
  }
  assert.deepEqual(resolveFocusFields({ focusAreas: ["arm", "back", "chest", "leg"] }), { focus: null, focusAreas: ["leg", "chest", "back", "arm"] });
  assert.deepEqual(readFocusAreas({ focus: "chest" }), ["chest"]);
  assert.deepEqual(readFocusAreas({ focus: "unknown" }), []);
  assert.deepEqual(readFocusAreas({ focus: "chest", focusAreas: [] }), []);
  assert.deepEqual(resolveFocusFields({}, { focusAreas: ["chest", "back"] }).focusAreas, ["chest", "back"]);
});

test("new and legacy request fields conflict explicitly; source rules apply to the final onboarding input", () => {
  const profile = { ageYears: 25, goal: "bulk", dailyActivity: "light", trainingFrequency: 3, sessionMinutes: 45,
    programSource: "app", motivationEnabled: true, motivationReason: "health" };
  const base = { baseVersions: { profile: "0", trainingPreferences: "0" }, trainingPreferences: { mode: "gym", equipment: [], noEquipment: true } };
  for (const fields of [{ focus: "chest" }, { focusAreas: ["back", "chest"] }, { focus: "chest", focusAreas: ["chest"] }]) {
    assert.equal(completeOnboardingSchema.safeParse({ ...base, profile: { ...profile, ...fields } }).success, true);
  }
  for (const fields of [{}, { focusAreas: [] }, { focus: null }, { focus: "chest", focusAreas: ["back"] }, { focus: null, focusAreas: ["chest", "back"] }]) {
    assert.equal(completeOnboardingSchema.safeParse({ ...base, profile: { ...profile, ...fields } }).success, false);
  }
  for (const fields of [{}, { focusAreas: [] }, { focus: null, focusAreas: [] }]) {
    assert.equal(completeOnboardingSchema.safeParse({ ...base, profile: { ...profile, programSource: "custom", ...fields } }).success, true);
  }
  assert.equal(profilePatchSchema.safeParse({ focus: "chest", focusAreas: ["back"] }).success, false);
  assert.throws(() => parseEntityPayload("profile", { focus: "chest", focusAreas: ["back"] }));
  assert.deepEqual(accountPatchSchema.parse({ baseVersions: { profile: "7" }, profile: { weightKg: 72 } }).profile, { weightKg: 72 });
});

test("focus distribution is OR, deterministic, bounded and deduplicated without cloning prescriptions", () => {
  const one = { id: "c1", focus: "chest", exercises: [{ id: "press", sets: 2, reps: 8 }] };
  const programs = [one, { ...one, id: "c2" }, { ...one, id: "b1", focus: "back" }, one];
  const result = distributeFocusPrograms(programs, ["chest", "back", "arm"], 2);
  assert.deepEqual(result.programs.map(p => p.id), ["c1", "b1", "c2"]);
  assert.deepEqual(result.focusCoverage, { requested: ["chest", "back", "arm"], available: ["chest", "back"], unavailable: ["arm"], scheduled: ["chest", "back"], unscheduled: ["arm"], unfilledSessions: 0 });
  assert.equal(result.programs[0], one); assert.equal(result.weeklyPlan.length, 2);
  const limited = distributeFocusPrograms(programs, ["chest", "back"], 1);
  assert.deepEqual(limited.focusCoverage.unavailable, []); assert.deepEqual(limited.focusCoverage.unscheduled, ["back"]);
  const empty = distributeFocusPrograms([], ["chest", "back"], 3);
  assert.deepEqual(empty.weeklyPlan, []); assert.equal(empty.focusCoverage.unfilledSessions, 3);
  assert.deepEqual(empty.focusCoverage.unavailable, ["chest", "back"]);
});

test("migration backfills only known legacy choices without rewriting versions, timestamps or receipts; DB enforces canonical arrays", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("drizzle/0000_initial_musmove_schema.sql", "utf8"));
    const choices = ["chest", "full", "unknown", "", null];
    const ids: string[] = [];
    for (const focus of choices) {
      const id = randomUUID(); ids.push(id);
      await db.query("INSERT INTO users(id,issuer,subject) VALUES ($1::uuid,'synthetic',$1::text)", [id]);
      await db.query("INSERT INTO profiles(user_id,focus,version) VALUES ($1,$2,7)", [id, focus]);
    }
    const before = (await db.query("SELECT user_id,focus,version,updated_at,deleted_at FROM profiles ORDER BY user_id")).rows;
    await db.query("INSERT INTO operation_receipts(user_id,operation_id,request_hash,result) VALUES ($1,$2,$3,'{}')", [ids[0], randomUUID(), "0".repeat(64)]);
    const receipts = (await db.query("SELECT * FROM operation_receipts")).rows;
    await db.exec(await readFile("drizzle/0021_multi_muscle_focus.sql", "utf8"));
    assert.deepEqual((await db.query("SELECT user_id,focus,version,updated_at,deleted_at FROM profiles ORDER BY user_id")).rows, before);
    assert.deepEqual((await db.query("SELECT * FROM operation_receipts")).rows, receipts);
    for (const [index, id] of ids.entries()) {
      const row = (await db.query<{ focus_areas: string[] }>("SELECT focus_areas FROM profiles WHERE user_id=$1", [id])).rows[0];
      assert.deepEqual(row.focus_areas, index < 2 ? [choices[index]] : []);
    }
    for (const areas of [["full", "chest"], ["back", "chest"], ["chest", "chest"], ["unknown"], [null]]) {
      await assert.rejects(db.query("UPDATE profiles SET focus_areas=$2 WHERE user_id=$1", [ids[0], areas]));
    }
    await db.query("UPDATE profiles SET focus_areas=ARRAY['chest','back'] WHERE user_id=$1", [ids[0]]);
    // Old backend versions still writing the string during rollout stay coherent.
    await db.query("UPDATE profiles SET focus='arm' WHERE user_id=$1", [ids[1]]);
    assert.deepEqual((await db.query<{ focus_areas: string[] }>("SELECT focus_areas FROM profiles WHERE user_id=$1", [ids[1]])).rows[0].focus_areas, ["arm"]);
  } finally { await db.close(); }
});

test("focus rotation favors unserved targets without adding sessions or duplicating program IDs", () => {
  const programs = ["leg", "chest", "back", "arm"].map(focus => ({ id: focus, focus }));
  const history = ["leg", "chest"].map(programId => ({ programId, finishedAt: new Date("2026-10-20T00:00:00Z") }));
  const result = distributeFocusPrograms(programs, ["leg", "chest", "back", "arm"], 2, history);
  assert.deepEqual(result.weeklyPlan.map(p => p.focus), ["back", "arm"]);
  assert.deepEqual(result.focusCoverage.unscheduled, ["leg", "chest"]);
  assert.deepEqual(result.focusCoverage.unavailable, []);
  assert.deepEqual(distributeFocusPrograms(programs, ["leg", "chest", "back", "arm"], 2, history), result);
  assert.equal(distributeFocusPrograms(programs, ["leg", "chest", "back", "arm"], 0, history).weeklyPlan.length, 0);
});

test("three sessions cover three focuses; standard variants rotate before compact fallbacks", () => {
  const exercises = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const programs = [
    { id: "compact", focus: "chest", exercises: [{ id: "a" }] },
    { id: "standard-a", focus: "chest", exercises },
    { id: "standard-b", focus: "chest", exercises },
    { id: "legs", focus: "leg", exercises }, { id: "back", focus: "back", exercises },
  ];
  const history = [{ programId: "standard-a", finishedAt: new Date("2026-10-20T00:00:00Z") }];
  const result = distributeFocusPrograms(programs, ["leg", "chest", "back"], 3, history);
  assert.deepEqual(result.focusCoverage.scheduled, ["leg", "chest", "back"]);
  assert.deepEqual(result.focusCoverage.unscheduled, []);
  assert.equal(result.weeklyPlan.find(p => p.focus === "chest")!.programId, "standard-b");
  assert.equal(new Set(result.weeklyPlan.map(p => p.programId)).size, 3);
  const one = distributeFocusPrograms(programs.filter(p => p.focus === "chest"), ["chest"], 3, history);
  assert.deepEqual(one.weeklyPlan.map(p => p.programId), ["standard-b", "standard-a", "compact"]);
  assert.equal(one.programs.find(p => p.id === "standard-a"), programs[1]);
});

test("focus credit survives filtered historical variants but never creates unavailable candidates", () => {
  const programs = [{ id: "new-leg", focus: "leg" }, { id: "new-back", focus: "back" }];
  const history = [{ programId: "retired-leg", focus: "leg", finishedAt: new Date("2026-10-20T00:00:00Z") }];
  const result = distributeFocusPrograms(programs, ["leg", "back", "arm"], 1, history);
  assert.equal(result.weeklyPlan[0].focus, "back");
  assert.deepEqual(result.focusCoverage.unavailable, ["arm"]);
});

test("richer catalog migration adds 29 bounded templates without changing legacy IDs, entries or profiles", async () => {
  const db = new PGlite();
  try {
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
    for (const migration of migrations.slice(0, 22)) await db.exec(migration.sql.join("\n"));
    const oldPrograms = (await db.query<{ id: string }>("SELECT * FROM workout_program_catalog ORDER BY id")).rows;
    const oldEntries = (await db.query("SELECT * FROM workout_program_exercises ORDER BY program_id,position")).rows;
    const userId = randomUUID();
    await db.query("INSERT INTO users(id,issuer,subject) VALUES($1::uuid,$2,$1::text)", [userId, "synthetic"]);
    await db.query("INSERT INTO profiles(user_id,focus,focus_areas,training_frequency) VALUES($1,NULL,ARRAY[$2,$3,$4],3)", [userId, "leg", "chest", "back"]);
    const before = (await db.query("SELECT * FROM profiles")).rows;
    await db.exec("BEGIN;");
    await db.exec(migrations[22].sql.join("\n"));
    await db.exec("COMMIT;");
    assert.deepEqual((await db.query("SELECT * FROM profiles")).rows, before);
    const programs = (await db.query<{ id: string }>("SELECT * FROM workout_program_catalog ORDER BY id")).rows;
    const oldIds = oldPrograms.map(p => p.id);
    assert.equal(programs.length, 41);
    assert.deepEqual(programs.filter(p => oldIds.includes(p.id)), oldPrograms);
    const entries = (await db.query<{ program_id: string }>("SELECT * FROM workout_program_exercises ORDER BY program_id,position")).rows;
    assert.deepEqual(entries.filter(p => oldIds.includes(p.program_id)), oldEntries);
    const counts = await db.query<{ n: number }>("SELECT count(*)::integer n FROM workout_program_exercises e WHERE e.program_id NOT IN (SELECT unnest($1::text[])) GROUP BY program_id", [oldIds]);
    assert.equal(counts.rows.length, 29); assert.ok(counts.rows.every(row => row.n >= 3 && row.n <= 4));
  } finally { await db.close(); }
});
