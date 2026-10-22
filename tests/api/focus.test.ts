import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
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
