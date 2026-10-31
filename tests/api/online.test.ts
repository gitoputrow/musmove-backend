import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import type { Database } from "../../src/db/client";
import * as schema from "../../src/db/schema";
import { bootstrap, pullChanges, pushOperations } from "../../src/modules/sync/service";
import { syncPushSchema } from "../../src/modules/sync/dto";
import { startSnapshot, snapshotPage, snapshotPageSchema } from "../../src/modules/sync/snapshots";
import { accountPatchSchema, versionSchema } from "../../src/modules/online/dto";

const exercise = { mode: "gym", name: "Synthetic exercise", defaultSets: 2, defaultReps: 8 };
const prescription = (id: string) => ({ id, idLabel: "forged", enLabel: "forged", requirements: [["forged"]], sets: 2, reps: 8, targetWeightKg: null });
const program = (exerciseId: string, weekday: number | null = null) => ({ mode: "gym", name: "Synthetic program", durationMinutes: 30, weekday, exercisePrescriptions: [prescription(exerciseId)] });
const onboarding = () => ({ baseVersions: { profile: "0", trainingPreferences: "0" }, profile: { ageYears: 25, goal: "bulk", dailyActivity: "light", trainingFrequency: 3, sessionMinutes: 60, programSource: "app", focus: "full", motivationEnabled: false, motivationReason: "health", gender: "non_binary", weightKg: 70, heightCm: 175, formulaSex: "male", trainingContext: { painAreas: ["knee"], recoveryStatus: "recovered" } }, trainingPreferences: { mode: "gym", equipment: ["dumbbell", "bench"], noEquipment: false } });
const startedAt = "2026-10-20T00:00:00Z", finishedAt = "2026-10-20T00:30:00Z", date = "2026-10-20";
const manualWithNewExercises = (ids = [`user-exercise-${randomUUID()}`]) => ({
  id: `workout-${randomUUID()}`, source: "manual", mode: "gym", startedAt, finishedAt, recordedOn: date,
  exerciseSnapshot: ids.map(prescription),
  setLog: [{ exerciseId: ids[0], setNumber: 1, completed: true, reps: 8, weightKg: 5 }],
  newExercises: ids.map(id => ({ id, data: { ...exercise, name: "  New manual exercise  ", defaultSets: 3, defaultReps: 10 } })),
});

test("PATCH DTO has no implicit boolean defaults and strictly checks matching versions", () => {
  const parsed = accountPatchSchema.parse({ baseVersions: { profile: "1" }, profile: { weightKg: 72 } });
  assert.deepEqual(parsed.profile, { weightKg: 72 });
  for (const value of ["bad", "01", "-1", "9223372036854775808"]) assert.equal(versionSchema.safeParse(value).success, false);
  for (const input of [
    { baseVersions: {}, profile: { weightKg: 72 } }, { baseVersions: { profile: "1" }, profile: {} },
    { baseVersions: { profile: "1" }, profile: { setupCompleted: false } },
    { baseVersions: { profile: "1", trainingPreferences: "1" }, profile: { weightKg: 72 } },
  ]) assert.equal(accountPatchSchema.safeParse(input).success, false);
});

test("Online feature APIs are isolated from production DB/Auth and email", async t => {
  Object.assign(process.env, { NODE_ENV: "test", SYNC_CURSOR_SECRET: randomBytes(32).toString("hex") }); delete process.env.VERCEL;
  const local = new PGlite(), db = drizzle(local, { schema });
  const globals = globalThis as unknown as { musmoveDatabase?: Database; musmovePool?: unknown };
  const previous = { db: globals.musmoveDatabase, pool: globals.musmovePool, fetch: globalThis.fetch, auth: process.env.NEON_AUTH_BASE_URL };
  globals.musmovePool = { query() { throw new Error("External database forbidden"); }, end: async () => {} };
  globalThis.fetch = (input, init) => {
    if (new URL(input instanceof Request ? input.url : String(input)).hostname !== "127.0.0.1") throw new Error("External network forbidden");
    return previous.fetch(input, init);
  };
  const pair = await generateKeyPair("EdDSA");
  const jwk = { ...await exportJWK(pair.publicKey), kid: "online-local", alg: "EdDSA", use: "sig" };
  const server = createServer((req, res) => req.url === "/auth/.well-known/jwks.json" ? res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ keys: [jwk] })) : res.writeHead(404).end());
  try {
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "drizzle", migrationsTable: "migrations" });
    globals.musmoveDatabase = db as unknown as Database;
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const issuer = `http://127.0.0.1:${address.port}`; process.env.NEON_AUTH_BASE_URL = `${issuer}/auth`;
    const routes: Record<string, Record<string, unknown>> = {
      me: await import("../../app/api/v1/me/route"),
      "onboarding/complete": await import("../../app/api/v1/onboarding/complete/route"),
      "programs/custom": await import("../../app/api/v1/programs/custom/route"),
      "programs/custom/:id": await import("../../app/api/v1/programs/custom/[id]/route"),
      "exercises/custom": await import("../../app/api/v1/exercises/custom/route"),
      "exercises/custom/:id": await import("../../app/api/v1/exercises/custom/[id]/route"),
      "social/drafts": await import("../../app/api/v1/social/drafts/route"),
      "social/drafts/:id": await import("../../app/api/v1/social/drafts/[id]/route"),
      meals: await import("../../app/api/v1/meals/route"), "meals/:id": await import("../../app/api/v1/meals/[id]/route"),
      workouts: await import("../../app/api/v1/workouts/route"), "workouts/:id": await import("../../app/api/v1/workouts/[id]/route"),
      places: await import("../../app/api/v1/places/route"), "places/:id/favorite": await import("../../app/api/v1/places/[id]/favorite/route"),
      dashboard: await import("../../app/api/v1/dashboard/route"), schedule: await import("../../app/api/v1/schedule/route"), statistics: await import("../../app/api/v1/statistics/route"),
      "programs/recommendations": await import("../../app/api/v1/programs/recommendations/route"),
      "catalog/exercises": await import("../../app/api/v1/catalog/exercises/route"),
    };
    async function call(path: string, jwt?: string, method = "GET", body?: unknown, key: string | null = randomUUID()) {
      const pathname = path.split("?")[0];
      const template = Object.keys(routes).find(p => p === pathname) ?? Object.keys(routes).find(p => p.includes(":id") && new RegExp(`^${p.replace(":id", "([^/]+)")}$`).test(pathname));
      assert.ok(template, `No test route for ${path}`);
      const match = template.includes(":id") ? pathname.match(new RegExp(`^${template.replace(":id", "([^/]+)")}$`)) : null;
      const handler = routes[template][method] as (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
      assert.equal(typeof handler, "function");
      const response = await handler(new Request(`https://api.example.test/api/v1/${path}`, {
        method, headers: { "content-type": "application/json", ...(jwt ? { authorization: `Bearer ${jwt}` } : {}), ...(key ? { "idempotency-key": key } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }), { params: Promise.resolve({ id: match?.[1] ?? "" }) });
      const result = response.status === 204 ? null : await response.json();
      return { response, status: response.status, body: result };
    }
    async function account(setup = false) {
      const jwt = await new SignJWT({ role: "authenticated", banned: false }).setProtectedHeader({ alg: "EdDSA", kid: jwk.kid })
        .setIssuer(issuer).setAudience(issuer).setSubject(randomUUID()).setIssuedAt().setExpirationTime("15m").sign(pair.privateKey);
      const first = await call("me", jwt); assert.equal(first.status, 200);
      if (setup) assert.equal((await call("onboarding/complete", jwt, "POST", onboarding())).status, 200);
      return { jwt, id: first.body.user.id as string };
    }
    async function setupProgram(jwt: string, weekday: number | null = null) {
      const exerciseId = `exercise-${randomUUID()}`, id = `program-${randomUUID()}`;
      const result = await call("programs/custom", jwt, "POST", { id, data: program(exerciseId, weekday), newExercises: [{ id: exerciseId, data: exercise }] });
      assert.equal(result.status, 201, JSON.stringify(result.body)); return { id, exerciseId, item: result.body.item };
    }
    const count = async (table: string, userId: string) => (await local.query<{ n: number }>(`SELECT count(*)::integer n FROM ${table} WHERE user_id=$1`, [userId])).rows[0].n;
    async function exerciseIdsForFocus(focus: string) {
      const entries = await db.select({ id: schema.workoutProgramExercises.exerciseId }).from(schema.workoutProgramExercises)
        .innerJoin(schema.workoutProgramCatalog, eq(schema.workoutProgramExercises.programId, schema.workoutProgramCatalog.id))
        .where(eq(schema.workoutProgramCatalog.focus, focus));
      return [...new Set(entries.map(entry => entry.id))];
    }

    await t.test("Regression: missing-level account requesting leg/chest/back three times gets three standard sessions without profile mutation", async () => {
      const a = await account();
      const equipment = (await db.select().from(schema.equipmentCatalog)).filter(item => item.active && item.modes.includes("gym")).map(item => item.id);
      const input = { ...onboarding(), profile: { ...onboarding().profile, focus: undefined, focusAreas: ["leg", "chest", "back"], sessionMinutes: 45,
        trainingContext: { painAreas: [], recoveryStatus: "recovered" } }, trainingPreferences: { mode: "gym", equipment, noEquipment: false } };
      assert.equal((await call("onboarding/complete", a.jwt, "POST", input)).status, 200);
      const before = (await call("me", a.jwt)).body;
      const result = await call("programs/recommendations", a.jwt); assert.equal(result.status, 200);
      assert.equal(result.body.personalization.suggestedWeeklySessions, 3); assert.equal(result.body.weeklyPlan.length, 3);
      assert.equal(result.body.personalization.trainingLevelSource, "CONSERVATIVE_DEFAULT");
      assert.deepEqual(result.body.personalization.missingProfileFields, ["trainingLevel"]);
      assert.deepEqual(result.body.focusCoverage.scheduled, ["leg", "chest", "back"]); assert.deepEqual(result.body.focusCoverage.unscheduled, []);
      for (const slot of result.body.weeklyPlan) {
        const plan = result.body.programs.find((p: { id: string }) => p.id === slot.programId);
        assert.ok(plan); assert.equal(plan.recommendationTier, "standard"); assert.ok(plan.exercises.length >= 3);
        assert.ok(!("durationMinutes" in plan)); assert.equal(new Set(plan.exercises.map((e: { id: string }) => e.id)).size, plan.exercises.length);
        assert.ok(plan.exercises.every((e: { sets: number; targetWeightKg: number | null }) => e.sets === 2 && e.targetWeightKg === null));
      }
      assert.deepEqual((await call("me", a.jwt)).body, before);
      assert.equal(before.profile.trainingLevel, null); assert.equal(await count("operation_receipts", a.id), 1);
      // Changing to one available slot must rotate after reported completion,
      // not keep choosing leg merely because it is first in canonical order.
      assert.equal((await call("me", a.jwt, "PATCH", { baseVersions: { profile: "1" }, profile: { trainingFrequency: 1 } })).status, 200);
      const first = (await call("programs/recommendations", a.jwt)).body;
      const plan = first.programs.find((p: { id: string }) => p.id === first.weeklyPlan[0].programId);
      assert.equal(first.weeklyPlan[0].focus, "leg");
      // An identically named custom plan cannot count as public-program credit.
      await db.insert(schema.workoutSessions).values({ userId: a.id, id: "custom-provenance", planId: plan.id, mode: "gym", status: "completed",
        startedAt: new Date(startedAt), finishedAt: new Date(finishedAt), recordedOn: date, exerciseSnapshot: plan.exercises, setLog: [], legacyMetadata: { source: "custom" } });
      assert.equal((await call("programs/recommendations", a.jwt)).body.weeklyPlan[0].focus, "leg");
      const saved = await call("workouts", a.jwt, "POST", { id: "rotation-completed", source: "recommended", programId: plan.id, mode: "gym",
        exerciseSnapshot: plan.exercises, setLog: [], startedAt, finishedAt, recordedOn: date });
      assert.equal(saved.status, 201);
      assert.equal((await call("programs/recommendations", a.jwt)).body.weeklyPlan[0].focus, "chest");
      await db.update(schema.workoutProgramCatalog).set({ active: false }).where(eq(schema.workoutProgramCatalog.id, plan.id));
      try { assert.equal((await call("programs/recommendations", a.jwt)).body.weeklyPlan[0].focus, "chest"); }
      finally { await db.update(schema.workoutProgramCatalog).set({ active: true }).where(eq(schema.workoutProgramCatalog.id, plan.id)); }
      // The performed snapshot survives all recommendation/catalog changes.
      assert.deepEqual((await call("workouts/rotation-completed", a.jwt)).body.item.exerciseSnapshot, plan.exercises);
    });

    await t.test("Training level round-trips on initial setup and versioned PATCH; omission preserves, invalid input never writes", async () => {
      const a = await account();
      const setup = await call("onboarding/complete", a.jwt, "POST", { ...onboarding(), profile: { ...onboarding().profile, trainingLevel: "intermediate" } });
      assert.equal(setup.status, 200); assert.equal(setup.body.profile.trainingLevel, "intermediate");
      assert.equal((await call("me", a.jwt)).body.profile.trainingLevel, "intermediate");
      const changed = await call("me", a.jwt, "PATCH", { baseVersions: { profile: "1" }, profile: { trainingLevel: "advanced" } });
      assert.equal(changed.status, 200); assert.equal(changed.body.profile.trainingLevel, "advanced");
      assert.equal((await call("programs/recommendations", a.jwt)).body.personalization.trainingLevelSource, "PROFILE");
      for (const value of ["expert", "", 3]) assert.equal((await call("me", a.jwt, "PATCH", { baseVersions: { profile: "2" }, profile: { trainingLevel: value } })).status, 400);
      const preserved = await call("me", a.jwt, "PATCH", { baseVersions: { profile: "2" }, profile: { displayName: "Changed name" } });
      assert.equal(preserved.status, 200); assert.equal(preserved.body.profile.trainingLevel, "advanced");
      const cleared = await call("me", a.jwt, "PATCH", { baseVersions: { profile: "3" }, profile: { trainingLevel: null } });
      assert.equal(cleared.status, 200); assert.equal(cleared.body.profile.trainingLevel, null);
      assert.equal((await call("programs/recommendations", a.jwt)).body.personalization.trainingLevelSource, "CONSERVATIVE_DEFAULT");
    });

    await t.test("Multi-focus onboarding persists canonical arrays, returns ACK and replays atomically without crossing accounts", async () => {
      const a = await account(), b = await account(), key = randomUUID();
      const input = { ...onboarding(), profile: { ...onboarding().profile, focus: undefined, focusAreas: ["back", "chest"] } };
      const result = await call("onboarding/complete", a.jwt, "POST", input, key);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.profile.focus, null); assert.equal(result.body.profile.version, "1");
      assert.deepEqual(result.body.profile.focusAreas, ["chest", "back"]);
      assert.deepEqual((await call("me", a.jwt)).body.profile, result.body.profile);
      assert.equal((await call("me", b.jwt)).body.profile, null);
      assert.deepEqual((await call("onboarding/complete", a.jwt, "POST", input, key)).body, result.body);
      assert.equal(await count("operation_receipts", a.id), 1); assert.equal(await count("sync_changes", a.id), 2);
      const snapshot = await bootstrap(a.id);
      assert.deepEqual((snapshot.entities.profile[0].payload as Record<string, unknown>).focusAreas, ["chest", "back"]);
      const snapshotId = randomUUID(); await startSnapshot(a.id, snapshotId);
      const page = await snapshotPage(a.id, snapshotPageSchema.parse({ snapshotId, limit: "50" }));
      const profile = page.items.find(item => item.entityType === "profile")!.payload as Record<string, unknown>;
      assert.deepEqual(profile.focusAreas, ["chest", "back"]); assert.equal(profile.focus, null);
      const custom = await call("onboarding/complete", b.jwt, "POST", { ...input, profile: { ...input.profile, programSource: "custom", focusAreas: [] } });
      assert.equal(custom.status, 200); assert.deepEqual(custom.body.profile.focusAreas, []);
    });

    await t.test("Multi-focus PATCH merges final source, preserves omission, rejects conflicting/invalid/stale updates and replays lost ACK", async () => {
      const a = await account(true), key = randomUUID(), cursor = (await bootstrap(a.id)).cursor;
      const input = { baseVersions: { profile: "1" }, profile: { focusAreas: ["back", "chest"] } };
      const saved = await call("me", a.jwt, "PATCH", input, key);
      assert.equal(saved.status, 200); assert.equal(saved.body.profile.focus, null); assert.equal(saved.body.profile.version, "2");
      assert.deepEqual(saved.body.profile.focusAreas, ["chest", "back"]);
      assert.deepEqual((await call("me", a.jwt, "PATCH", input, key)).body, saved.body);
      assert.equal((await call("me", a.jwt, "PATCH", { ...input, profile: { focusAreas: ["arm"] } }, key)).body.error.code, "IDEMPOTENCY_KEY_REUSE");
      assert.equal((await call("me", a.jwt, "PATCH", input)).body.error.code, "VERSION_CONFLICT");
      const delta = await pullChanges(a.id, cursor, 100); assert.equal(delta.changes.length, 1);
      assert.deepEqual((delta.changes[0].payload as Record<string, unknown>).focusAreas, ["chest", "back"]);
      const nutrition = saved.body.nutritionTargets.estimate;
      for (const profile of [{ focusAreas: [] }, { focusAreas: null }, { focusAreas: ["full", "back"] }, { focusAreas: ["chest", "chest"] }, { focusAreas: [1] }, { focusAreas: ["shoulder"] }, { focus: "arm", focusAreas: ["back"] }, { focus: null, focusAreas: ["chest", "back"] }]) {
        assert.equal((await call("me", a.jwt, "PATCH", { baseVersions: { profile: "2" }, profile })).status, 400);
      }
      assert.equal((await call("me", a.jwt)).body.profile.version, "2");
      const unrelated = await call("me", a.jwt, "PATCH", { baseVersions: { profile: "2" }, profile: { displayName: "Unrelated edit" } });
      assert.equal(unrelated.status, 200); assert.deepEqual(unrelated.body.profile.focusAreas, ["chest", "back"]);
      assert.equal(unrelated.body.nutritionTargets.estimate.calories, nutrition.calories);
      assert.equal(unrelated.body.nutritionTargets.estimate.proteinGrams, nutrition.proteinGrams);
      const cleared = await call("me", a.jwt, "PATCH", { baseVersions: { profile: "3" }, profile: { programSource: "custom", focusAreas: [] } });
      assert.equal(cleared.status, 200); assert.deepEqual(cleared.body.profile.focusAreas, []);
      assert.equal((await call("me", a.jwt, "PATCH", { baseVersions: { profile: "4" }, profile: { programSource: "app" } })).status, 400);
      const full = await call("me", a.jwt, "PATCH", { baseVersions: { profile: "4" }, profile: { programSource: "app", focusAreas: ["full"] } });
      assert.equal(full.status, 200); assert.equal(full.body.profile.focus, "full");
      const legacy = await call("me", a.jwt, "PATCH", { baseVersions: { profile: "5" }, profile: { focus: "arm" } });
      assert.equal(legacy.status, 200); assert.deepEqual(legacy.body.profile.focusAreas, ["arm"]);
      const both = await call("me", a.jwt, "PATCH", { baseVersions: { profile: "6" }, profile: { focus: "chest", focusAreas: ["chest"] } });
      assert.equal(both.status, 200); assert.deepEqual(both.body.profile.focusAreas, ["chest"]);
    });

    await t.test("Multi-focus recommendations union candidates, retain safety filters, explain unavailable focus and never add volume/days", async () => {
      const a = await account(true);
      const patch = (version: string, profile: object, trainingPreferences?: object) => call("me", a.jwt, "PATCH", {
        baseVersions: { profile: version, ...(trainingPreferences ? { trainingPreferences: "1" } : {}) }, profile, ...(trainingPreferences ? { trainingPreferences } : {}),
      });
      assert.equal((await patch("1", { focusAreas: ["chest"], trainingContext: { painAreas: [] } })).status, 200);
      const single = (await call("programs/recommendations", a.jwt)).body;
      assert.equal((await patch("2", { focusAreas: ["back", "chest"] })).status, 200);
      const multi = await call("programs/recommendations", a.jwt); assert.equal(multi.status, 200);
      assert.deepEqual(multi.body.preferences.focusAreas, ["chest", "back"]); assert.equal(multi.body.preferences.focus, null);
      assert.deepEqual(multi.body.focusCoverage.available, ["chest", "back"]); assert.deepEqual(multi.body.focusCoverage.unavailable, []);
      assert.equal(multi.body.personalization.suggestedWeeklySessions, single.personalization.suggestedWeeklySessions);
      assert.ok(multi.body.weeklyPlan.length <= single.personalization.suggestedWeeklySessions);
      assert.deepEqual(multi.body.programs.find((p: { focus: string }) => p.focus === "chest"), single.programs[0]);
      assert.equal(new Set(multi.body.programs.map((p: { id: string }) => p.id)).size, multi.body.programs.length);
      assert.ok(multi.body.programs.every((p: { mode: string; focus: string }) => p.mode === "gym" && ["chest", "back"].includes(p.focus) && !("durationMinutes" in p)));
      assert.equal((await patch("3", { trainingFrequency: 1 })).status, 200);
      const limited = (await call("programs/recommendations", a.jwt)).body;
      assert.equal(limited.weeklyPlan.length, 1); assert.deepEqual(limited.focusCoverage.unscheduled, ["back"]);
      const backIds = await exerciseIdsForFocus("back"), chestIds = await exerciseIdsForFocus("chest");
      assert.equal((await patch("4", { excludedExerciseIds: backIds })).status, 200);
      const partial = (await call("programs/recommendations", a.jwt)).body;
      assert.deepEqual(partial.focusCoverage.unavailable, ["back"]); assert.equal(partial.reason, null);
      assert.equal((await patch("5", { excludedExerciseIds: [...new Set([...backIds, ...chestIds])] })).status, 200);
      const empty = (await call("programs/recommendations", a.jwt)).body;
      assert.deepEqual(empty.programs, []); assert.deepEqual(empty.focusCoverage.unavailable, ["chest", "back"]); assert.equal(empty.reason, "NO_MATCHING_PROGRAM");
      assert.equal((await patch("6", { excludedExerciseIds: [] }, { equipment: [], noEquipment: true })).status, 200);
      const unequipped = (await call("programs/recommendations", a.jwt)).body; assert.deepEqual(unequipped.programs, []);
      assert.equal((await call("me", a.jwt, "PATCH", { baseVersions: { profile: "7", trainingPreferences: "2" },
        profile: { sessionMinutes: 10, trainingLevel: "advanced" }, trainingPreferences: { equipment: ["dumbbell"], noEquipment: false } })).status, 200);
      const tooLong = (await call("programs/recommendations", a.jwt)).body;
      assert.ok(tooLong.programs.length > 0);
      assert.ok(tooLong.programs.every((p: object) => !("durationMinutes" in p)));
      assert.ok(tooLong.rejectedPrograms.every((p: { reason: string }) => p.reason !== "SESSION_DURATION_EXCEEDED"));
      assert.equal((await call("me", a.jwt, "PATCH", { baseVersions: { profile: "8", trainingPreferences: "3" },
        profile: { sessionMinutes: 60, trainingLevel: "beginner" }, trainingPreferences: { mode: "calisthenics", equipment: [], noEquipment: true } })).status, 200);
      const calisthenics = (await call("programs/recommendations", a.jwt)).body;
      assert.ok(calisthenics.programs.length); assert.ok(calisthenics.programs.every((p: { mode: string }) => p.mode === "calisthenics"));
      assert.equal((await patch("9", { programSource: "custom", focusAreas: [] })).status, 200);
      assert.equal((await call("programs/recommendations", a.jwt)).body.error.code, "PREFERENCES_REQUIRED");
    });

    await t.test("All added read/write routes require authentication and reject ownership in input", async () => {
      for (const [path, methods] of Object.entries(routes)) {
        if (path === "catalog/exercises") continue; // Public catalog is tested separately.
        for (const method of Object.keys(methods).filter(k => ["GET", "POST", "PATCH", "PUT", "DELETE"].includes(k))) {
          const result = await call(path.replace(":id", "synthetic"), undefined, method, method === "GET" ? undefined : {});
          assert.equal(result.status, 401, `${method} ${path}`); assert.equal(result.response.headers.get("cache-control"), "private, no-store");
        }
      }
      const a = await account();
      assert.equal((await call("social/drafts", a.jwt, "POST", { id: "draft", data: { body: "Private", metadata: null }, userId: "foreign" })).status, 400);
      assert.equal((await call("social/drafts", a.jwt, "POST", { id: "draft", data: { body: "Private", metadata: null } }, null)).status, 400);
      assert.equal((await call("social/drafts?userId=foreign", a.jwt)).status, 400);
    });

    await t.test("One account PATCH preserves omission/null semantics, completion, capabilities and context; retry is exact", async () => {
      const a = await account(true); const before = (await call("me", a.jwt)).body;
      const input = { baseVersions: { profile: before.versions.profile, trainingPreferences: before.versions.trainingPreferences, userPreferences: "0" },
        profile: { weightKg: 72, trainingContext: { recoveryStatus: "tired" } }, trainingPreferences: { equipment: ["dumbbell"], noEquipment: false },
        userPreferences: { budgetIsManual: true, budgetRupiah: 50000, placesArea: "Jakarta Selatan" } };
      const key = randomUUID(); const saved = await call("me", a.jwt, "PATCH", input, key); assert.equal(saved.status, 200, JSON.stringify(saved.body));
      assert.equal(saved.body.setupCompleted, true); assert.equal(saved.body.profile.motivationEnabled, false); assert.equal(saved.body.profile.gender, "non_binary");
      assert.equal(saved.body.profile.heightCm, 175); assert.deepEqual(saved.body.profile.trainingContext, { painAreas: ["knee"], recoveryStatus: "tired" });
      assert.equal(saved.body.nutritionTargets.profileVersion, "2"); assert.deepEqual(saved.body.versions, { profile: "2", trainingPreferences: "2", userPreferences: "1" });
      assert.deepEqual((await call("me", a.jwt, "PATCH", input, key)).body, saved.body);
      assert.equal((await call("me", a.jwt, "PATCH", { ...input, profile: { weightKg: 73 } }, key)).body.error.code, "IDEMPOTENCY_KEY_REUSE");
      assert.equal((await call("me", a.jwt, "PATCH", input)).body.error.code, "VERSION_CONFLICT");
      const cleared = await call("me", a.jwt, "PATCH", { baseVersions: { profile: "2" }, profile: { weightKg: null } }); assert.equal(cleared.status, 200);
      assert.equal(cleared.body.profile.weightKg, null); assert.notEqual(cleared.body.nutritionTargets.estimate.status, "ready");
      const optional = await account();
      assert.equal((await call("me", optional.jwt, "PATCH", { baseVersions: { userPreferences: "0" }, userPreferences: { placesArea: "Jakarta" } })).status, 200);
      assert.equal((await call("me", optional.jwt)).body.setupCompleted, false);
      assert.equal((await call("me", optional.jwt, "PATCH", { baseVersions: { profile: "0" }, profile: { weightKg: 70 } })).status, 400);
    });

    await t.test("Invalid related equipment and transactional failures leave profile/nutrition/receipts unchanged", async () => {
      const a = await account(true), key = randomUUID();
      const input = { baseVersions: { profile: "1", trainingPreferences: "1" }, profile: { weightKg: 80, focusAreas: ["chest", "back"] }, trainingPreferences: { mode: "calisthenics", equipment: ["dumbbell"] } };
      assert.equal((await call("me", a.jwt, "PATCH", input)).status, 400);
      input.trainingPreferences.mode = "gym";
      await local.exec("CREATE FUNCTION online_fail_preferences() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER online_fail BEFORE UPDATE ON training_preferences FOR EACH ROW EXECUTE FUNCTION online_fail_preferences();");
      const errorLog = console.error; console.error = () => {};
      try { assert.equal((await call("me", a.jwt, "PATCH", input, key)).status, 500); }
      finally { console.error = errorLog; await local.exec("DROP TRIGGER online_fail ON training_preferences; DROP FUNCTION online_fail_preferences();"); }
      assert.equal((await call("me", a.jwt)).body.profile.weightKg, 70); assert.equal(await count("nutrition_estimates", a.id), 1);
      assert.deepEqual((await call("me", a.jwt)).body.profile.focusAreas, ["full"]);
      assert.equal(await count("operation_receipts", a.id), 1); assert.equal(await count("sync_changes", a.id), 2);
      const retry = await call("me", a.jwt, "PATCH", input, key); assert.equal(retry.status, 200); assert.deepEqual(retry.body.profile.focusAreas, ["chest", "back"]);
    });

    await t.test("Custom programs no longer require or expose estimated duration; historical values stay intact", async () => {
      const a = await account();
      const data = program("press", 1);
      const { durationMinutes: _old, ...withoutDuration } = data; void _old;
      const created = await call("programs/custom", a.jwt, "POST", { id: "duration-free", data: withoutDuration });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.ok(!("durationMinutes" in created.body.item));
      const stored = await local.query<{ duration_minutes: number | null }>("SELECT duration_minutes FROM custom_programs WHERE user_id=$1 AND id=$2", [a.id, "duration-free"]);
      assert.equal(stored.rows[0].duration_minutes, null);
      assert.ok(!("durationMinutes" in (await call("programs/custom/duration-free", a.jwt)).body.item));
      assert.ok(!("durationMinutes" in (await call("programs/custom", a.jwt)).body.items[0]));
      await local.query("UPDATE custom_programs SET duration_minutes=40 WHERE user_id=$1 AND id=$2", [a.id, "duration-free"]);
      const updated = await call("programs/custom/duration-free", a.jwt, "PATCH", { baseVersion: "1", changes: { name: "Updated" } });
      assert.equal(updated.status, 200);
      assert.ok(!("durationMinutes" in updated.body.item));
      assert.equal((await local.query<{ duration_minutes: number }>("SELECT duration_minutes FROM custom_programs WHERE user_id=$1 AND id=$2", [a.id, "duration-free"])).rows[0].duration_minutes, 40);
      assert.ok(!("durationMinutes" in (await call("schedule?from=2026-11-01&to=2026-11-07", a.jwt)).body.weeklyPrograms[0]));
    });

    await t.test("Program plus new exercises is atomic; schedule conflicts roll back every write", async () => {
      const a = await account(), one = await setupProgram(a.jwt, 2);
      assert.ok(!("durationMinutes" in one.item));
      assert.equal(one.item.exercisePrescriptions[0].idLabel, exercise.name);
      const newId = `exercise-${randomUUID()}`;
      const result = await call("programs/custom", a.jwt, "POST", { id: "collision", data: program(newId, 2), newExercises: [{ id: newId, data: exercise }] });
      assert.equal(result.status, 409); assert.equal(await count("user_exercises", a.id), 1); assert.equal(await count("custom_programs", a.id), 1);
      const invalid = await call("programs/custom", a.jwt, "POST", { id: "invalid", data: program("missing"), newExercises: [{ id: "rolled-back", data: exercise }] });
      assert.equal(invalid.status, 400); assert.equal(await count("user_exercises", a.id), 1);
      const edited = await call(`programs/custom/${one.id}`, a.jwt, "PATCH", { baseVersion: "1", changes: { name: "Renamed", weekday: 3 } });
      assert.equal(edited.status, 200, JSON.stringify(edited.body)); assert.equal(edited.body.item.version, "2");
      assert.ok(!("durationMinutes" in edited.body.item));
      assert.equal((await call(`programs/custom/${one.id}`, a.jwt, "PATCH", { baseVersion: "1", changes: { name: "stale" } })).status, 409);
      assert.equal((await call(`exercises/custom/${one.exerciseId}`, a.jwt, "PATCH", { baseVersion: "1", changes: { mode: "calisthenics" } })).status, 400);
      assert.equal((await call(`programs/custom/${one.id}`, a.jwt, "DELETE", { baseVersion: "2" })).status, 200);
      assert.equal((await call(`programs/custom/${one.id}`, a.jwt)).status, 404);
    });

    await t.test("Ownership isolation covers list/detail/edit/delete and foreign exercise references", async () => {
      const a = await account(), b = await account(), p = await setupProgram(a.jwt);
      for (const method of ["GET", "PATCH", "DELETE"]) {
        const body = method === "GET" ? undefined : method === "PATCH" ? { baseVersion: "1", changes: { name: "foreign" } } : { baseVersion: "1" };
        assert.equal((await call(`programs/custom/${p.id}`, b.jwt, method, body)).status, 404);
      }
      assert.equal((await call("programs/custom", b.jwt)).body.items.length, 0);
      assert.equal((await call("programs/custom", b.jwt, "POST", { id: "foreign-program", data: program(p.exerciseId) })).status, 400);
    });

    await t.test("Private drafts CRUD stays private, paginates with account/filter-bound cursors, and replays deletes", async () => {
      const a = await account(), b = await account();
      for (const id of ["a", "b", "c"]) assert.equal((await call("social/drafts", a.jwt, "POST", { id, data: { body: `Private ${id}`, metadata: { note: "private" } } })).status, 201);
      const first = await call("social/drafts?limit=2", a.jwt); assert.equal(first.body.items.length, 2); assert.ok(first.body.nextCursor);
      const next = await call(`social/drafts?cursor=${encodeURIComponent(first.body.nextCursor)}`, a.jwt); assert.equal(next.body.items[0].id, "c");
      assert.equal((await call(`social/drafts?cursor=${encodeURIComponent(first.body.nextCursor)}`, b.jwt)).status, 400);
      assert.equal(await count("social_posts", a.id), 0); assert.equal((await call("social/drafts/a", b.jwt)).status, 404);
      assert.equal((await call("social/drafts/a", a.jwt, "PATCH", { baseVersion: "1", changes: { body: "Edited" } })).body.item.metadata.note, "private");
      const key = randomUUID(), body = { baseVersion: "2" };
      const deleted = await call("social/drafts/a", a.jwt, "DELETE", body, key); assert.equal(deleted.body.deleted, true);
      assert.deepEqual((await call("social/drafts/a", a.jwt, "DELETE", body, key)).body, deleted.body);
      assert.equal((await call("social/drafts/a", a.jwt)).status, 404);
      assert.equal((await call("social/drafts", a.jwt, "POST", { id: "a", data: { body: "resurrect", metadata: null } })).status, 409);
    });

    await t.test("Meal writes preserve historical nutrition/price and return canonical daily summaries", async () => {
      const a = await account(true), b = await account();
      const input = { id: "food", data: { menuName: "forged", note: null, samplePriceRupiah: 1, snapshot: {}, catalogId: "tkpi-ap001", servings: 1.5, consumedAt: startedAt, recordedOn: date, mealType: "breakfast" } };
      const key = randomUUID(), created = await call("meals", a.jwt, "POST", input, key); assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.equal(created.body.item.caloriesKcal, 270); assert.equal(created.body.journals[0].summary.reportedTotals.caloriesKcal, 270);
      const price = created.body.item.samplePriceRupiah, perServing = created.body.item.nutritionPerServing;
      assert.deepEqual((await call("meals", a.jwt, "POST", input, key)).body, created.body);
      await db.update(schema.mealCatalog).set({ caloriesKcal: 1, samplePriceRupiah: 999999 }).where(eq(schema.mealCatalog.id, "tkpi-ap001"));
      const edited = await call("meals/food", a.jwt, "PATCH", { baseVersion: "1", changes: { servings: 2 } }); assert.equal(edited.status, 200, JSON.stringify(edited.body));
      assert.equal(edited.body.item.caloriesKcal, 360); assert.equal(edited.body.item.samplePriceRupiah, price); assert.deepEqual(edited.body.item.nutritionPerServing, perServing);
      assert.equal((await call("meals/food", b.jwt)).status, 404);
      const moved = await call("meals/food", a.jwt, "PATCH", { baseVersion: "2", changes: { consumedAt: "2026-10-21T00:00:00Z", recordedOn: "2026-10-21" } });
      assert.equal(moved.body.journals.length, 2); assert.equal(moved.body.journals.find((j: { date: string }) => j.date === date).summary.reportedTotals.caloriesKcal, 0);
      const removed = await call("meals/food", a.jwt, "DELETE", { baseVersion: "3" }); assert.equal(removed.body.journals[0].summary.entryCount, 0);
      const custom = await call("meals", a.jwt, "POST", { id: "custom", data: { menuName: "Reported", note: null, samplePriceRupiah: null, snapshot: {}, catalogId: null, servings: 1, consumedAt: startedAt, recordedOn: date, mealType: "lunch", nutrition: { caloriesKcal: 300, proteinGrams: 10 } } });
      assert.equal(custom.body.item.snapshot.nutritionDetails.sourceType, "user_reported");
    });

    await t.test("Favorite mutations use per-place versions, retain tombstones and isolate accounts", async () => {
      const a = await account(), b = await account();
      const places = await call("places?limit=1", a.jwt), placeId = places.body.places[0].id;
      assert.equal(places.body.places[0].favoriteVersion, "0");
      const added = await call(`places/${placeId}/favorite`, a.jwt, "PUT", { baseVersion: "0" }); assert.equal(added.status, 200);
      assert.equal(added.body.favoriteVersion, "1");
      const viewed = (await call("places?limit=1", a.jwt)).body.places[0]; assert.equal(viewed.isFavorite, true); assert.equal(viewed.favoriteVersion, "1");
      assert.equal((await call("places?limit=1", b.jwt)).body.places[0].isFavorite, false);
      assert.equal((await call(`places/${placeId}/favorite`, a.jwt, "DELETE", { baseVersion: "0" })).status, 409);
      const removed = await call(`places/${placeId}/favorite`, a.jwt, "DELETE", { baseVersion: "1" }); assert.equal(removed.body.favoriteVersion, "2");
      assert.equal((await call(`places/${placeId}/favorite`, a.jwt, "PUT", { baseVersion: "2" })).body.favoriteVersion, "3");
    });

    await t.test("Workout saves only after finish, in one atomic write with retry-safe immutable history", async () => {
      const a = await account(), b = await account(), p = await setupProgram(a.jwt);
      const input = { id: "workout", source: "custom", programId: p.id, mode: "gym", startedAt, recordedOn: date,
        finishedAt, exerciseSnapshot: [prescription(p.exerciseId)],
        setLog: [{ exerciseId: p.exerciseId, setNumber: 1, completed: true, reps: 8, weightKg: 5 }], note: "Done" };
      assert.equal(await count("workout_sessions", a.id), 0, "Creating/browsing a program must not persist a workout");
      const { finishedAt: _finish, ...unfinished } = input; void _finish;
      assert.equal((await call("workouts", a.jwt, "POST", unfinished)).status, 400);
      assert.equal((await call("workouts", a.jwt, "POST", { ...input, status: "active" })).status, 400);
      assert.equal((await call("workouts", a.jwt, "POST", { ...input, setLog: [...input.setLog, ...input.setLog] })).status, 400);
      assert.equal((await call("workouts", a.jwt, "POST", { ...input, setLog: [{ ...input.setLog[0], setNumber: 3 }] })).status, 400);
      assert.equal(await count("workout_sessions", a.id), 0);
      const key = randomUUID(), saved = await call("workouts", a.jwt, "POST", input, key);
      assert.equal(saved.status, 201, JSON.stringify(saved.body)); assert.equal(saved.body.item.status, "completed");
      assert.equal(saved.body.item.version, "1"); assert.equal(saved.body.item.setLog.length, 1);
      assert.deepEqual((await call("workouts", a.jwt, "POST", input, key)).body, saved.body);
      assert.equal(await count("workout_sessions", a.id), 1);
      assert.equal((await call("workouts", a.jwt, "POST", { ...input, note: "changed" }, key)).body.error.code, "IDEMPOTENCY_KEY_REUSE");
      assert.equal((await call("workouts", b.jwt, "POST", { ...input, id: "foreign" })).status, 404);
      assert.equal((await call("workouts/workout", b.jwt)).status, 404);
      await call(`exercises/custom/${p.exerciseId}`, a.jwt, "PATCH", { baseVersion: "1", changes: { name: "New name" } });
      await call(`programs/custom/${p.id}`, a.jwt, "PATCH", { baseVersion: "1", changes: { exercisePrescriptions: [{ ...prescription(p.exerciseId), reps: 20 }] } });
      const history = await call("workouts/workout", a.jwt);
      assert.equal(history.body.item.exerciseSnapshot[0].reps, 8); assert.equal(history.body.item.exerciseSnapshot[0].idLabel, exercise.name);
      assert.equal((await call(`workouts?from=${date}&to=${date}`, a.jwt)).body.items.length, 1);
    });

    await t.test("Manual workout, schedule, dashboard and bounded statistics use only owner records", async () => {
      const a = await account(), b = await account(), p = await setupProgram(a.jwt, 2);
      const manual = { id: "manual-session", source: "manual", mode: "gym", exerciseSnapshot: [prescription(p.exerciseId)], setLog: [{ exerciseId: p.exerciseId, setNumber: 1, completed: true, reps: 8, weightKg: 5 }], startedAt, finishedAt, recordedOn: date, note: "Manual" };
      assert.equal((await call("workouts", a.jwt, "POST", { ...manual, finishedAt: "2026-10-19T00:00:00Z" })).status, 400);
      assert.equal((await call("workouts", a.jwt, "POST", manual)).status, 201);
      const dashboard = await call(`dashboard?date=${date}`, a.jwt); assert.equal(dashboard.status, 200, JSON.stringify(dashboard.body));
      assert.equal(dashboard.body.setupCompleted, false); assert.equal(dashboard.body.nutritionTargets, null); assert.equal(dashboard.body.scheduledPrograms.length, 1);
      const scheduled = await call(`schedule?from=${date}&to=${date}`, a.jwt); assert.equal(scheduled.body.weeklyPrograms.length, 1);
      const stats = await call(`statistics?from=${date}&to=${date}`, a.jwt); assert.equal(stats.status, 200, JSON.stringify(stats.body));
      assert.equal(stats.body.totals.completedWorkouts, 1); assert.equal(stats.body.totals.completedSets, 1); assert.equal(stats.body.totals.reportedExternalVolumeKg, 40);
      assert.equal(stats.body.totals.durationMinutes, null); assert.equal(stats.body.totals.workoutsMissingDuration, 1);
      assert.equal((await call(`statistics?from=${date}&to=${date}`, b.jwt)).body.totals.completedWorkouts, 0);
      assert.equal((await call("statistics?from=2020-01-01&to=2026-10-20", a.jwt)).status, 400);
      assert.equal((await call("workouts", b.jwt, "POST", manual)).status, 400, "Foreign custom exercise cannot be referenced");
    });

    await t.test("Free manual mode needs no profile/setup: mixed catalog exercises, variable per-set results, exact filters and summaries", async () => {
      const a = await account(), b = await account(), before = (await call("me", a.jwt)).body;
      const changeCursor = (await bootstrap(a.id)).cursor;
      const catalog = await call("catalog/exercises"); assert.equal(catalog.status, 200);
      assert.equal(catalog.body.exercises.length, 141);
      assert.deepEqual([...new Set(catalog.body.exercises.map((e: { mode: string }) => e.mode))].sort(), ["calisthenics", "gym"]);
      const input = { id: "mixed-manual", source: "manual", startedAt, finishedAt, recordedOn: date,
        exerciseSnapshot: [{ ...prescription("bench_press"), mode: "gym" }, { ...prescription("pullup"), mode: "calisthenics" }],
        setLog: [
          { exerciseId: "bench_press", exerciseMode: "gym", setNumber: 1, completed: true, reps: 10, weightKg: 40 },
          { exerciseId: "bench_press", exerciseMode: "gym", setNumber: 2, completed: true, reps: 8, weightKg: 45 },
          { exerciseId: "pullup", exerciseMode: "calisthenics", setNumber: 1, completed: true, reps: 8, weightKg: 0 },
          { exerciseId: "pullup", exerciseMode: "calisthenics", setNumber: 2, completed: true, reps: 6, weightKg: 0 },
        ] };
      const key = randomUUID(), saved = await call("workouts", a.jwt, "POST", input, key);
      assert.equal(saved.status, 201, JSON.stringify(saved.body)); assert.equal(saved.body.item.mode, "mixed");
      assert.equal(saved.body.item.status, "completed"); assert.deepEqual(saved.body.exercises, []);
      assert.deepEqual(saved.body.item.setLog, input.setLog);
      for (const snapshot of saved.body.item.exerciseSnapshot) {
        const canonical = catalog.body.exercises.find((e: { id: string; mode: string }) => e.id === snapshot.id && e.mode === snapshot.mode);
        assert.equal(snapshot.idLabel, canonical.idLabel); assert.equal(snapshot.enLabel, canonical.enLabel);
        assert.deepEqual(snapshot.requirements, canonical.requirements);
      }
      assert.deepEqual((await call("workouts", a.jwt, "POST", input, key)).body, saved.body);
      const changed = { ...input, setLog: input.setLog.map((s, i) => i ? s : { ...s, reps: 9 }) };
      assert.equal((await call("workouts", a.jwt, "POST", changed, key)).body.error.code, "IDEMPOTENCY_KEY_REUSE");
      assert.deepEqual((await call("workouts/mixed-manual", a.jwt)).body.item, saved.body.item);
      assert.equal((await call("workouts/mixed-manual", b.jwt)).status, 404);
      for (const mode of ["gym", "calisthenics"]) assert.deepEqual((await call(`workouts?mode=${mode}`, a.jwt)).body.items, []);
      assert.equal((await call("workouts?mode=mixed", a.jwt)).body.items.length, 1);
      assert.equal((await call("workouts", a.jwt)).body.items.length, 1); assert.deepEqual((await call("workouts", b.jwt)).body.items, []);
      const stats = (await call(`statistics?from=${date}&to=${date}`, a.jwt)).body;
      assert.equal(stats.totals.completedWorkouts, 1); assert.equal(stats.totals.completedSets, 4);
      assert.equal(stats.totals.reportedReps, 32); assert.equal(stats.totals.reportedExternalVolumeKg, 760);
      assert.equal(stats.totals.durationMinutes, null); assert.equal(stats.totals.workoutsMissingDuration, 1);
      assert.equal((await call(`schedule?from=${date}&to=${date}`, a.jwt)).body.workoutDays[0].completed, 1);
      assert.equal((await call(`dashboard?date=${date}`, a.jwt)).body.workoutDays[0].completed, 1);
      assert.deepEqual((await call("me", a.jwt)).body, before);
      assert.equal(await count("operation_receipts", a.id), 1); assert.equal(await count("workout_sessions", a.id), 1);
      const state = await bootstrap(a.id); assert.equal((state.entities.workout_session[0].payload as { mode: string }).mode, "mixed");
      const changes = await pullChanges(a.id, changeCursor, 100);
      assert.equal((changes.changes[0].payload as { mode: string }).mode, "mixed");
      const snap = await startSnapshot(a.id), page = await snapshotPage(a.id, snapshotPageSchema.parse({ snapshotId: snap.snapshotId, limit: 100 }));
      assert.equal((page.items.find(i => i.entityType === "workout_session")!.payload as { mode: string }).mode, "mixed");
      await db.update(schema.exerciseCatalog).set({ active: false }).where(eq(schema.exerciseCatalog.id, "bench_press"));
      try { assert.equal((await call("workouts", a.jwt, "POST", { ...input, id: "historical-inactive" })).status, 201); }
      finally { await db.update(schema.exerciseCatalog).set({ active: true }).where(eq(schema.exerciseCatalog.id, "bench_press")); }
      assert.equal((await call("workouts/mixed-manual", a.jwt, "DELETE", { baseVersion: "1" })).status, 200);
      assert.equal((await call("workouts/mixed-manual", a.jwt)).status, 404);
      assert.equal((await call("workouts?mode=mixed", a.jwt)).body.items.length, 1);
    });

    await t.test("Duplicate public IDs across modes remain distinct; incomplete/duplicate/wrong-mode refs and legacy sync cannot bypass validation", async () => {
      const a = await account();
      const base = { id: "mode-collision", source: "manual", startedAt, finishedAt, recordedOn: date,
        exerciseSnapshot: [{ ...prescription("squat"), mode: "gym", sets: 1 }, { ...prescription("squat"), mode: "calisthenics", sets: 1 }],
        setLog: [{ exerciseId: "squat", exerciseMode: "gym", setNumber: 1, completed: true, reps: 8, weightKg: 10 },
          { exerciseId: "squat", exerciseMode: "calisthenics", setNumber: 1, completed: true, reps: 12, weightKg: 0 }] };
      const invalid = [
        { ...base, mode: "mixed" }, { ...base, mode: "gym" }, { ...base, programId: "ignored" },
        { ...base, exerciseSnapshot: [prescription("squat"), base.exerciseSnapshot[1]] },
        { ...base, exerciseSnapshot: [base.exerciseSnapshot[0], base.exerciseSnapshot[0]] },
        { ...base, setLog: [{ ...base.setLog[0], exerciseMode: undefined }] },
        { ...base, setLog: [base.setLog[0], base.setLog[0]] },
        { ...base, setLog: [{ ...base.setLog[0], setNumber: 2 }] },
        { ...base, exerciseSnapshot: [{ ...prescription("bench_press"), mode: "calisthenics" }], setLog: [] },
        { ...base, exerciseSnapshot: Array.from({ length: 13 }, (_, i) => ({ ...prescription(`missing-${i}`), mode: "gym" })), setLog: [] },
        { ...base, source: "custom", programId: "program" }, { ...base, source: "recommended", programId: "program" },
      ];
      for (const input of invalid) assert.equal((await call("workouts", a.jwt, "POST", input)).status, 400);
      for (const table of ["workout_sessions", "sync_changes", "operation_receipts"]) assert.equal(await count(table, a.id), 0);
      const saved = await call("workouts", a.jwt, "POST", base); assert.equal(saved.status, 201, JSON.stringify(saved.body));
      assert.equal(saved.body.item.exerciseSnapshot.length, 2); assert.deepEqual(saved.body.item.setLog, base.setLog);
      assert.notDeepEqual(saved.body.item.exerciseSnapshot[0].requirements, saved.body.item.exerciseSnapshot[1].requirements);
      // Reject the new shape on legacy write paths; upgraded reads stay lossless.
      const { id: _id, version: _version, updatedAt: _at, ...payload } = saved.body.item; void _id; void _version; void _at;
      const legacy = await pushOperations(a.id, syncPushSchema.parse({ schemaVersion: 1, deviceId: "legacy", operations: [{
        operationId: randomUUID(), entityType: "workout_session", entityId: "sync-bypass", action: "upsert", baseVersion: "0", payload,
      }] }));
      assert.equal(legacy.results[0].status, "rejected"); assert.equal(await count("workout_sessions", a.id), 1);
    });

    await t.test("Cross-mode owned/new exercises are atomic, paginated without a mode filter, and isolated from foreign/tombstone/ambiguous IDs", async () => {
      const a = await account(true), b = await account(), first = `a-${randomUUID()}`, second = `b-${randomUUID()}`;
      const input = { id: "mixed-new", source: "manual", startedAt, finishedAt, recordedOn: date,
        exerciseSnapshot: [{ ...prescription(first), mode: "gym", sets: 1 }, { ...prescription(second), mode: "calisthenics", sets: 1 }], setLog: [],
        newExercises: [{ id: first, data: { ...exercise, defaultSets: 1 } }, { id: second, data: { ...exercise, mode: "calisthenics", defaultSets: 1 } }] };
      const key = randomUUID(), saved = await call("workouts", a.jwt, "POST", input, key); assert.equal(saved.status, 201, JSON.stringify(saved.body));
      assert.equal(saved.body.item.mode, "mixed"); assert.deepEqual(saved.body.exercises.map((e: { mode: string }) => e.mode), ["gym", "calisthenics"]);
      assert.ok(saved.body.item.exerciseSnapshot.every((e: { sets: number }) => e.sets === 1));
      assert.deepEqual((await call("workouts", a.jwt, "POST", input, key)).body, saved.body);
      assert.equal((await call("me", a.jwt)).body.trainingPreferences.mode, "gym");
      const page1 = (await call("exercises/custom?limit=1", a.jwt)).body;
      const page2 = (await call(`exercises/custom?limit=1&cursor=${encodeURIComponent(page1.nextCursor)}`, a.jwt)).body;
      assert.equal(page1.items[0].id, first); assert.equal(page2.items[0].id, second); assert.equal(page2.nextCursor, null);
      assert.equal((await call(`exercises/custom?mode=gym&cursor=${encodeURIComponent(page1.nextCursor)}`, a.jwt)).status, 400);
      const existing = { ...input, id: "existing", newExercises: undefined };
      assert.equal((await call("workouts", b.jwt, "POST", existing)).body.error.code, "EXERCISE_NOT_AVAILABLE");
      assert.equal(await count("user_exercises", b.id), 0);
      const wrongNew = { ...input, id: "wrong", newExercises: input.newExercises.map(e => ({ ...e, data: { ...e.data, mode: "gym" } })) };
      assert.equal((await call("workouts", b.jwt, "POST", wrongNew)).status, 400);
      const freshId = `fresh-${randomUUID()}`;
      const rollback = { ...existing, id: "rollback", exerciseSnapshot: [{ ...prescription(freshId), mode: "gym" }, { ...prescription(second), mode: "calisthenics" }],
        newExercises: [{ id: freshId, data: exercise }] };
      assert.equal((await call("workouts", b.jwt, "POST", rollback)).status, 400);
      for (const table of ["user_exercises", "workout_sessions", "operation_receipts", "sync_changes"]) assert.equal(await count(table, b.id), 0);
      assert.equal((await call(`exercises/custom/${second}`, a.jwt, "DELETE", { baseVersion: "1" })).status, 200);
      assert.equal((await call("workouts", a.jwt, "POST", existing)).status, 201, "Previously selected owned historical references remain valid");
      assert.deepEqual((await call("workouts/mixed-new", a.jwt)).body.item, saved.body.item);
      assert.equal((await call("workouts", a.jwt, "POST", { ...input, id: "tombstone" })).body.error.code, "RESOURCE_ID_REUSE");
      assert.equal((await call("workouts", b.jwt, "POST", input)).status, 201, "Explicitly new IDs are scoped to this account, never references to another owner");
      assert.equal(await count("user_exercises", b.id), 2);
      // Legacy account IDs may shadow catalog IDs; explicit manual never guesses.
      await db.insert(schema.userExercises).values({ userId: a.id, id: "squat", mode: "gym", name: "Legacy private squat", defaultSets: 1, defaultReps: 8 });
      const ambiguous = { ...existing, id: "ambiguous", exerciseSnapshot: [{ ...prescription("squat"), mode: "gym" }] };
      assert.equal((await call("workouts", a.jwt, "POST", ambiguous)).body.error.code, "AMBIGUOUS_EXERCISE_REFERENCE");
      assert.equal((await call("workouts", b.jwt, "POST", ambiguous)).status, 201, "Foreign shadow cannot affect public resolution");
    });

    await t.test("Free manual format does not loosen custom program or program-workout mode validation", async () => {
      const a = await account();
      const p = await call("programs/custom", a.jwt, "POST", { id: "strict-gym", data: program("bench_press") }); assert.equal(p.status, 201);
      for (const input of [
        { id: "bad-cali", data: program("pullup") },
        { id: "bad-mixed", data: { ...program("bench_press"), mode: "mixed" } },
        { id: "bad-field", data: { ...program("bench_press"), exercisePrescriptions: [{ ...prescription("bench_press"), mode: "gym" }] } },
      ]) assert.equal((await call("programs/custom", a.jwt, "POST", input)).status, 400);
      assert.equal((await call("programs/custom/strict-gym", a.jwt, "PATCH", { baseVersion: "1", changes: { exercisePrescriptions: [prescription("pullup")] } })).status, 400);
      const workout = { id: "program-history", source: "custom", programId: "strict-gym", mode: "gym", startedAt, finishedAt, recordedOn: date, exerciseSnapshot: [prescription("bench_press")], setLog: [] };
      assert.equal((await call("workouts", a.jwt, "POST", { ...workout, exerciseSnapshot: [prescription("pullup")] })).status, 400);
      assert.equal((await call("workouts", a.jwt, "POST", workout)).status, 201);
      assert.equal((await call("workouts", a.jwt, "POST", { ...workout, id: "missing-mode", mode: undefined })).status, 400);
      const single = { id: "single-free", source: "manual", startedAt, finishedAt, recordedOn: date,
        exerciseSnapshot: [{ ...prescription("pullup"), mode: "calisthenics", sets: 1 }], setLog: [] };
      const saved = await call("workouts", a.jwt, "POST", single); assert.equal(saved.status, 201); assert.equal(saved.body.item.mode, "calisthenics");
      assert.equal((await call("workouts?mode=calisthenics", a.jwt)).body.items.length, 1);
      const all = (await call("workouts?limit=1", a.jwt)).body; assert.equal(all.items.length, 1); assert.ok(all.nextCursor);
      assert.equal((await call(`workouts?limit=1&cursor=${all.nextCursor}`, a.jwt)).body.items.length, 1);
      assert.equal((await call("workouts?mode=unknown", a.jwt)).status, 400);
    });

    await t.test("Result metrics v2 freeze holds, muscles, duration and volume without workout calories in the same receipt", async () => {
      const a = await account(true), key = randomUUID();
      const finish = new Date(Date.now() - 1000).toISOString(), start = new Date(Date.parse(finish) - 1800000).toISOString();
      const input = { id: "result-metrics", source: "manual", startedAt: start, finishedAt: finish, recordedOn: start.slice(0, 10),
        sessionTiming: { source: "user_reported", durationSeconds: 1800 },
        exerciseSnapshot: [{ ...prescription("bench_press"), mode: "gym" },
          { ...prescription("plank"), mode: "calisthenics", reps: null, trackingType: "duration", targetDurationSeconds: 20,
            muscleTargets: { version: "1", primary: ["biceps"], secondary: [] } }],
        setLog: [{ exerciseId: "bench_press", exerciseMode: "gym", setNumber: 1, completed: true, reps: 10, weightKg: 40 },
          { exerciseId: "bench_press", exerciseMode: "gym", setNumber: 2, completed: true, reps: 8, weightKg: 45 },
          { exerciseId: "plank", exerciseMode: "calisthenics", setNumber: 1, completed: true, reps: null, weightKg: 0, durationSeconds: 30 },
          { exerciseId: "plank", exerciseMode: "calisthenics", setNumber: 2, completed: true, reps: null, weightKg: null, durationSeconds: 45 }] };
      const saved = await call("workouts", a.jwt, "POST", input, key); assert.equal(saved.status, 201, JSON.stringify(saved.body));
      assert.deepEqual(saved.body.item.setLog, input.setLog); assert.equal(saved.body.item.mode, "mixed");
      const metrics = saved.body.item.resultMetrics; assert.equal(metrics.duration.seconds, 1800); assert.equal(metrics.version, "2");
      assert.equal("energy" in metrics, false); assert.deepEqual(Object.keys(metrics).sort(), ["duration", "muscles", "version"]);
      assert.equal(metrics.muscles.coverage, "complete"); assert.ok(metrics.muscles.primary.includes("abs")); assert.ok(metrics.muscles.primary.includes("chest"));
      assert.ok(!metrics.muscles.primary.includes("biceps")); assert.equal(saved.body.item.exerciseSnapshot[1].reps, null);
      const totals = (await call(`statistics?from=${start.slice(0, 10)}&to=${start.slice(0, 10)}`, a.jwt)).body.totals;
      assert.equal(totals.totalHoldSeconds, 75); assert.equal(totals.reportedReps, 18); assert.equal(totals.reportedExternalVolumeKg, 760);
      assert.equal(totals.completedSets, 4); assert.equal(totals.durationMinutes, 30); assert.equal(totals.setsMissingLoad, 0);
      const [plank] = await db.select().from(schema.exerciseCatalog).where(eq(schema.exerciseCatalog.id, "plank"));
      await db.update(schema.exerciseCatalog).set({ muscleTargets: { version: "1", primary: ["glutes"], secondary: [] } }).where(eq(schema.exerciseCatalog.id, "plank"));
      try {
        assert.equal((await call("me", a.jwt, "PATCH", { baseVersions: { profile: "1" }, profile: { weightKg: 80 } })).status, 200);
        assert.deepEqual((await call("workouts", a.jwt, "POST", input, key)).body, saved.body);
        assert.deepEqual((await call("workouts/result-metrics", a.jwt)).body.item, saved.body.item);
        assert.deepEqual((await call("workouts", a.jwt)).body.items[0].resultMetrics, metrics);
      } finally { await db.update(schema.exerciseCatalog).set({ muscleTargets: plank.muscleTargets }).where(eq(schema.exerciseCatalog.id, "plank")); }
    });

    await t.test("Historical v1 energy snapshots and exact receipts survive the v2 removal without rewriting history", async () => {
      const a = await account(), key = randomUUID();
      const input = { id: "legacy-energy", source: "manual", mode: "gym", startedAt, finishedAt, recordedOn: date,
        sessionTiming: { source: "user_reported", durationSeconds: 1800 },
        exerciseSnapshot: [prescription("bench_press")], setLog: [{ exerciseId: "bench_press", setNumber: 1, completed: true, reps: 8, weightKg: 10 }] };
      const saved = await call("workouts", a.jwt, "POST", input, key); assert.equal(saved.status, 201);
      // Simulate a pre-removal immutable row and receipt. The former calorie
      // inputs were optional, so this request body was also valid in v1.
      const legacy = { ...saved.body.item.resultMetrics, version: "1", energy: { kcal: 128.6, method: "standard_met_gross_v1", bodyweightKg: 70 } };
      const response = { ...saved.body, item: { ...saved.body.item, resultMetrics: legacy } };
      await db.update(schema.workoutSessions).set({ resultMetrics: legacy }).where(eq(schema.workoutSessions.userId, a.id));
      const [receipt] = await db.select().from(schema.operationReceipts).where(eq(schema.operationReceipts.operationId, key));
      await db.update(schema.operationReceipts).set({ result: { ...receipt.result, response } }).where(eq(schema.operationReceipts.operationId, key));
      const before = (await local.query("SELECT result_metrics,version,updated_at FROM workout_sessions WHERE user_id=$1", [a.id])).rows;
      const receipts = (await local.query("SELECT * FROM operation_receipts WHERE user_id=$1", [a.id])).rows;
      assert.deepEqual((await call("workouts/legacy-energy", a.jwt)).body.item, response.item);
      assert.deepEqual((await call("workouts", a.jwt)).body.items[0], response.item);
      assert.deepEqual((await call("workouts", a.jwt, "POST", input, key)).body, response);
      assert.deepEqual(((await bootstrap(a.id)).entities.workout_session[0].payload as { resultMetrics: unknown }).resultMetrics, legacy);
      assert.deepEqual((await local.query("SELECT result_metrics,version,updated_at FROM workout_sessions WHERE user_id=$1", [a.id])).rows, before);
      assert.deepEqual((await local.query("SELECT * FROM operation_receipts WHERE user_id=$1", [a.id])).rows, receipts);
    });

    await t.test("Timed custom exercises/programs keep null reps, canonical unknown muscles, strict mode and immutable measurement kind", async () => {
      const a = await account();
      const data = { mode: "gym", name: "My timed exercise", defaultSets: 1, defaultReps: null, trackingType: "duration", defaultDurationSeconds: 30 };
      const timed = { ...prescription("own-hold"), sets: 1, reps: null, trackingType: "duration", targetDurationSeconds: 30 };
      const created = await call("programs/custom", a.jwt, "POST", { id: "timed-program", data: { ...program("own-hold"), exercisePrescriptions: [timed] }, newExercises: [{ id: "own-hold", data }] });
      assert.equal(created.status, 201, JSON.stringify(created.body)); assert.equal(created.body.exercises[0].defaultReps, null);
      const input = { id: "timed-program-history", source: "custom", mode: "gym", programId: "timed-program", startedAt, finishedAt, recordedOn: date,
        sessionTiming: { source: "timer" }, exerciseSnapshot: [timed], setLog: [{ exerciseId: "own-hold", setNumber: 1, completed: true, reps: null, weightKg: 0, durationSeconds: 35 }] };
      const saved = await call("workouts", a.jwt, "POST", input); assert.equal(saved.status, 201, JSON.stringify(saved.body));
      assert.equal(saved.body.item.resultMetrics.duration.seconds, 1800); assert.equal("energy" in saved.body.item.resultMetrics, false);
      assert.equal(saved.body.item.resultMetrics.muscles.coverage, "unknown"); assert.equal(saved.body.item.exerciseSnapshot[0].muscleTargets, null);
      assert.equal((await call("exercises/custom/own-hold", a.jwt, "PATCH", { baseVersion: "1", changes: { trackingType: "repetitions", defaultReps: 8, defaultDurationSeconds: null } })).body.error.code, "IMMUTABLE_FIELD");
      const manual = { id: "atomic-timed", source: "manual", startedAt, finishedAt, recordedOn: date,
        exerciseSnapshot: [{ ...prescription("new-timed"), mode: "calisthenics", sets: 1, reps: null, trackingType: "duration", targetDurationSeconds: 30 }, { ...prescription("bench_press"), mode: "gym", sets: 1 }],
        setLog: [{ exerciseId: "new-timed", exerciseMode: "calisthenics", setNumber: 1, completed: true, reps: null, weightKg: null, durationSeconds: 20 },
          { exerciseId: "bench_press", exerciseMode: "gym", setNumber: 1, completed: true, reps: 8, weightKg: 0 }],
        newExercises: [{ id: "new-timed", data: { ...data, mode: "calisthenics" } }] };
      const m = await call("workouts", a.jwt, "POST", manual); assert.equal(m.status, 201, JSON.stringify(m.body)); assert.equal(m.body.item.resultMetrics.muscles.coverage, "partial");
      assert.equal(m.body.item.resultMetrics.duration.seconds, null, "Hold seconds must not fabricate session duration");
      const before = m.body.item;
      assert.equal((await call("exercises/custom/new-timed", a.jwt, "PATCH", { baseVersion: "1", changes: { name: "Renamed", defaultDurationSeconds: 60 } })).status, 200);
      assert.deepEqual((await call("workouts/atomic-timed", a.jwt)).body.item, before);
    });

    await t.test("Invalid measurement combinations and timing reject atomically; null actuals stay unknown and zero external load stays zero", async () => {
      const a = await account();
      const hold = { ...prescription("plank"), mode: "gym", sets: 1, reps: null, trackingType: "duration", targetDurationSeconds: 30 };
      const log = { exerciseId: "plank", exerciseMode: "gym", setNumber: 1, completed: true, reps: null, weightKg: 0, durationSeconds: 20 };
      const base = { id: "invalid-metrics", source: "manual", startedAt, finishedAt, recordedOn: date, exerciseSnapshot: [hold], setLog: [log] };
      const invalid = [
        { ...base, exerciseSnapshot: [{ ...hold, reps: 8 }] }, { ...base, exerciseSnapshot: [{ ...hold, targetDurationSeconds: null }] },
        { ...base, setLog: [{ ...log, reps: 8 }] }, ...[0, -1, 1.5, 3601].map(durationSeconds => ({ ...base, setLog: [{ ...log, durationSeconds }] })),
        { ...base, exerciseSnapshot: [{ ...prescription("bench_press"), mode: "gym" }], setLog: [{ ...log, exerciseId: "bench_press" }] },
        { ...base, exerciseSnapshot: [{ ...hold, id: "bench_press" }], setLog: [] },
        { ...base, resultMetrics: { energy: { kcal: 500 } } },
        { ...base, resultMetrics: { version: "2", duration: {}, muscles: {} } },
        { ...base, energyActivityCode: "02054" }, { ...base, workoutBodyweightKg: 70 },
        { ...base, energyActivityCode: null }, { ...base, workoutBodyweightKg: null },
        { ...base, sessionTiming: { source: "user_reported" } }, { ...base, sessionTiming: { source: "timer", durationSeconds: 30 } },
        { ...base, sessionTiming: { source: "user_reported", durationSeconds: 0 } },
        { ...base, sessionTiming: { source: "user_reported", durationSeconds: 10 } },
      ];
      for (const input of invalid) assert.equal((await call("workouts", a.jwt, "POST", input)).status, 400, JSON.stringify(input));
      assert.equal(await count("workout_sessions", a.id), 0); assert.equal(await count("operation_receipts", a.id), 0);
      const unknown = await call("workouts", a.jwt, "POST", { ...base, id: "unknown-hold", setLog: [{ ...log, durationSeconds: null }] }); assert.equal(unknown.status, 201);
      assert.equal("energy" in unknown.body.item.resultMetrics, false); assert.equal(unknown.body.item.resultMetrics.duration.seconds, null);
      const rep = { id: "zero-rep", source: "manual", mode: "gym", startedAt, finishedAt, recordedOn: date,
        exerciseSnapshot: [prescription("bench_press")], setLog: [{ exerciseId: "bench_press", setNumber: 1, completed: true, reps: 8, weightKg: 0 }] };
      assert.equal((await call("workouts", a.jwt, "POST", rep)).status, 201);
      let totals = (await call(`statistics?from=${date}&to=${date}`, a.jwt)).body.totals;
      assert.equal(totals.reportedExternalVolumeKg, 0); assert.equal(totals.totalHoldSeconds, null); assert.equal(totals.setsMissingDuration, 1);
      assert.equal((await call("workouts", a.jwt, "POST", { ...rep, id: "unknown-rep", setLog: [{ ...rep.setLog[0], reps: null, weightKg: null }] })).status, 201);
      totals = (await call(`statistics?from=${date}&to=${date}`, a.jwt)).body.totals;
      assert.equal(totals.reportedReps, null); assert.equal(totals.reportedExternalVolumeKg, null); assert.equal(totals.setsMissingReps, 1);
      // Defensive reporting for historical unvalidated rows: never include a
      // completed log that does not reference its stored prescription.
      await db.insert(schema.workoutSessions).values({ userId: a.id, id: "legacy-unmatched", planId: "manual", mode: "gym", status: "completed",
        startedAt: new Date(startedAt), finishedAt: new Date(finishedAt), recordedOn: date, exerciseSnapshot: [prescription("bench_press")],
        setLog: [{ exerciseId: "not-in-snapshot", setNumber: 1, completed: true, reps: 100, weightKg: 100 }] });
      totals = (await call(`statistics?from=${date}&to=${date}`, a.jwt)).body.totals;
      assert.equal(totals.unmatchedCompletedSets, 1); assert.equal(totals.completedSets, 3); assert.equal(totals.reportedExternalVolumeKg, null);
    });

    await t.test("Manual workout and new exercises commit together and return canonical immutable snapshots", async () => {
      const a = await account(), input = manualWithNewExercises([`user-exercise-${randomUUID()}`, `user-exercise-${randomUUID()}`]);
      const cursor = (await bootstrap(a.id)).cursor;
      const saved = await call("workouts", a.jwt, "POST", input);
      assert.equal(saved.status, 201, JSON.stringify(saved.body)); assert.equal(saved.body.item.status, "completed");
      assert.equal(saved.body.exercises.length, 2); assert.equal(saved.body.item.version, "1");
      for (const [index, created] of saved.body.exercises.entries()) {
        assert.equal(created.id, input.newExercises[index].id); assert.equal(created.name, "New manual exercise");
        assert.equal(created.defaultSets, 3); assert.equal(created.defaultReps, 10); assert.equal(created.version, "1");
        assert.equal(created.userId, undefined); assert.equal(created.deletedAt, undefined);
        const snapshot = saved.body.item.exerciseSnapshot[index];
        assert.equal(snapshot.idLabel, created.name); assert.equal(snapshot.enLabel, created.name);
        assert.deepEqual(snapshot.requirements, [[]]); assert.equal(snapshot.sets, 2); assert.equal(snapshot.reps, 8);
      }
      assert.equal(await count("workout_sessions", a.id), 1); assert.equal(await count("user_exercises", a.id), 2);
      assert.equal(await count("operation_receipts", a.id), 1);
      const delta = await pullChanges(a.id, cursor, 100);
      assert.deepEqual(delta.changes.map(change => change.entityType), ["user_exercise", "user_exercise", "workout_session"]);
      for (const change of delta.changes) assert.equal(change.version, "1");
      const id = input.newExercises[0].id;
      assert.equal((await call(`exercises/custom/${id}`, a.jwt, "PATCH", { baseVersion: "1", changes: { name: "Changed later", defaultSets: 5, defaultReps: 20 } })).status, 200);
      const detail = await call(`workouts/${input.id}`, a.jwt);
      assert.deepEqual(detail.body.item, saved.body.item);
    });

    await t.test("Retry after an ignored response replays the whole transaction without duplicating rows, events or versions", async () => {
      const a = await account(), input = manualWithNewExercises(), key = randomUUID();
      // Deliberately discard the first response, modeling a client that never
      // received its ACK. This is not a real transport-disconnect simulation.
      await call("workouts", a.jwt, "POST", input, key);
      const [receipt] = await db.select().from(schema.operationReceipts).where(eq(schema.operationReceipts.userId, a.id));
      assert.ok(receipt);
      const retry = await call("workouts", a.jwt, "POST", input, key);
      assert.equal(retry.status, 201);
      assert.equal(retry.body.exercises[0].version, "1"); assert.equal(retry.body.item.version, "1");
      assert.deepEqual(retry.body, receipt.result.response);
      for (const table of ["workout_sessions", "user_exercises", "operation_receipts"]) assert.equal(await count(table, a.id), 1);
      assert.equal(await count("sync_changes", a.id), 2);
      const changed = { ...input, newExercises: [{ ...input.newExercises[0], data: { ...exercise, name: "Changed payload" } }] };
      const rejected = await call("workouts", a.jwt, "POST", changed, key);
      assert.equal(rejected.status, 409); assert.equal(rejected.body.error.code, "IDEMPOTENCY_KEY_REUSE");
      assert.equal(await count("sync_changes", a.id), 2);
    });

    await t.test("Failure inserting an exercise or the workout rolls back all rows/events/receipt and permits the same-key retry", async () => {
      for (const failAt of ["exercise", "workout"]) {
        const a = await account(), key = randomUUID(), input = manualWithNewExercises([`user-exercise-${randomUUID()}`, `user-exercise-${randomUUID()}`]);
        const [state] = await db.select().from(schema.syncState).where(eq(schema.syncState.userId, a.id));
        const table = failAt === "exercise" ? "user_exercises" : "workout_sessions";
        const failId = failAt === "exercise" ? input.newExercises[1].id : input.id;
        await local.exec(`CREATE FUNCTION manual_atomic_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${failId}' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER manual_atomic_fail BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION manual_atomic_fail();`);
        const previousError = console.error; console.error = () => {};
        try { assert.equal((await call("workouts", a.jwt, "POST", input, key)).status, 500); }
        finally { console.error = previousError; await local.exec(`DROP TRIGGER manual_atomic_fail ON ${table}; DROP FUNCTION manual_atomic_fail();`); }
        for (const name of ["user_exercises", "workout_sessions", "operation_receipts", "sync_changes"]) assert.equal(await count(name, a.id), 0, `${failAt}: ${name}`);
        const [after] = await db.select().from(schema.syncState).where(eq(schema.syncState.userId, a.id));
        assert.equal(after.nextSequence, state.nextSequence);
        assert.equal((await call("workouts", a.jwt, "POST", input, key)).status, 201);
      }
    });

    await t.test("A mixed-workout database failure rolls back both modes and permits the identical final-submit retry", async () => {
      const a = await account(), key = randomUUID();
      const { mode: _mode, ...base } = manualWithNewExercises([`mixed-a-${randomUUID()}`, `mixed-b-${randomUUID()}`]); void _mode;
      const input = { ...base, exerciseSnapshot: base.exerciseSnapshot.map((e, i) => ({ ...e, mode: i ? "calisthenics" : "gym" })),
        setLog: base.setLog.map(e => ({ ...e, exerciseMode: "gym" })),
        newExercises: base.newExercises.map((e, i) => ({ ...e, data: { ...e.data, mode: i ? "calisthenics" : "gym" } })) };
      await local.exec(`CREATE FUNCTION mixed_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${input.id}' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER mixed_fail BEFORE INSERT ON workout_sessions FOR EACH ROW EXECUTE FUNCTION mixed_fail();`);
      const previousError = console.error; console.error = () => {};
      try { assert.equal((await call("workouts", a.jwt, "POST", input, key)).status, 500); }
      finally { console.error = previousError; await local.exec("DROP TRIGGER mixed_fail ON workout_sessions; DROP FUNCTION mixed_fail();"); }
      for (const table of ["user_exercises", "workout_sessions", "sync_changes", "operation_receipts"]) assert.equal(await count(table, a.id), 0);
      const saved = await call("workouts", a.jwt, "POST", input, key); assert.equal(saved.status, 201); assert.equal(saved.body.item.mode, "mixed");
      assert.deepEqual((await call("workouts", a.jwt, "POST", input, key)).body, saved.body);
      assert.equal(await count("sync_changes", a.id), 3);
    });

    await t.test("Invalid new exercise modes, references, duplicates, dates, sets and payload sizes do not leave partial state", async () => {
      const a = await account(), input = manualWithNewExercises(), entry = input.newExercises[0];
      const cases = [
        { ...input, source: "custom", programId: "some-program" },
        { ...input, source: "recommended", programId: "some-program", newExercises: [] },
        { ...input, newExercises: [{ ...entry, data: { ...entry.data, mode: "calisthenics" } }] },
        { ...input, newExercises: [{ ...entry, id: "not-used-in-snapshot" }] },
        { ...input, newExercises: [entry, entry] },
        { ...input, newExercises: [{ ...entry, id: "invalid/id" }] },
        { ...input, newExercises: [{ ...entry, data: { ...entry.data, defaultSets: 11 } }] },
        { ...input, newExercises: [{ ...entry, userId: "foreign" }] },
        { ...input, exerciseSnapshot: [...input.exerciseSnapshot, ...input.exerciseSnapshot] },
        { ...input, setLog: [...input.setLog, ...input.setLog] },
        { ...input, setLog: [{ ...input.setLog[0], setNumber: 3 }] },
        { ...input, recordedOn: "2020-01-01" },
        manualWithNewExercises(Array.from({ length: 13 }, () => `user-exercise-${randomUUID()}`)),
      ];
      for (const invalid of cases) assert.equal((await call("workouts", a.jwt, "POST", invalid)).status, 400);
      assert.equal((await call("workouts", a.jwt, "POST", { ...input, note: "x".repeat(66000) })).status, 413);
      for (const name of ["user_exercises", "workout_sessions", "operation_receipts", "sync_changes"]) assert.equal(await count(name, a.id), 0);
    });

    await t.test("Existing own/catalog/tombstone IDs conflict; foreign references fail without leaking or overwriting accounts", async () => {
      const a = await account(), b = await account(), input = manualWithNewExercises();
      const entry = input.newExercises[0];
      assert.equal((await call("exercises/custom", a.jwt, "POST", { id: entry.id, data: exercise })).status, 201);
      const collision = await call("workouts", a.jwt, "POST", input);
      assert.equal(collision.status, 409); assert.equal(collision.body.error.code, "RESOURCE_ID_REUSE");
      await call(`exercises/custom/${entry.id}`, a.jwt, "DELETE", { baseVersion: "1" });
      assert.equal((await call("workouts", a.jwt, "POST", input)).status, 409, "Tombstone is not a reusable new ID");
      const [catalog] = await db.select({ id: schema.exerciseCatalog.id }).from(schema.exerciseCatalog).where(eq(schema.exerciseCatalog.mode, "gym")).limit(1);
      assert.equal((await call("workouts", a.jwt, "POST", manualWithNewExercises([catalog.id]))).status, 409);
      const fresh = manualWithNewExercises();
      const foreign = { ...fresh, exerciseSnapshot: [...fresh.exerciseSnapshot, prescription(entry.id)] };
      assert.equal((await call("workouts", b.jwt, "POST", foreign)).status, 400);
      assert.equal(await count("user_exercises", b.id), 0); assert.equal(await count("workout_sessions", b.id), 0);
      // IDs are account-scoped: an explicitly new local exercise with the same
      // ID as another account is not a reference to that account's private data.
      const own = await call("workouts", b.jwt, "POST", input); assert.equal(own.status, 201);
      const aExercise = await db.select().from(schema.userExercises).where(eq(schema.userExercises.userId, a.id));
      assert.equal(aExercise[0].version, BigInt(2)); assert.ok(aExercise[0].deletedAt);
      assert.equal((await call(`workouts/${input.id}`, a.jwt)).status, 404);
    });

    await t.test("Manual payloads without newExercises still work and pre-upgrade receipts replay unchanged", async () => {
      const a = await account(), p = await setupProgram(a.jwt);
      const input = { id: "manual-existing", source: "manual", mode: "gym", exerciseSnapshot: [prescription(p.exerciseId)], setLog: [], startedAt, finishedAt, recordedOn: date };
      const key = randomUUID(), saved = await call("workouts", a.jwt, "POST", input, key);
      assert.equal(saved.status, 201); assert.deepEqual(saved.body.exercises, []);
      const [receipt] = await db.select().from(schema.operationReceipts).where(eq(schema.operationReceipts.operationId, key));
      const { exercises: _extra, ...oldResponse } = saved.body; void _extra;
      await db.update(schema.operationReceipts).set({ result: { ...receipt.result, response: oldResponse } }).where(eq(schema.operationReceipts.operationId, key));
      assert.deepEqual((await call("workouts", a.jwt, "POST", input, key)).body, oldResponse);
      assert.equal(await count("workout_sessions", a.id), 1);
      assert.equal((await call("workouts", a.jwt, "POST", { ...input, id: "manual-empty", newExercises: [] })).status, 201);
    });

    await t.test("Direct writes are visible to legacy sync; stale legacy writes and reused receipts cannot overwrite them", async () => {
      const a = await account(), cursor = (await bootstrap(a.id)).cursor, key = randomUUID();
      const input = { id: "exercise", data: exercise }; assert.equal((await call("exercises/custom", a.jwt, "POST", input, key)).status, 201);
      const delta = await pullChanges(a.id, cursor, 100); assert.equal(delta.changes.length, 1); assert.equal(delta.changes[0].entityType, "user_exercise");
      assert.equal((delta.changes[0].payload as Record<string, unknown>).name, exercise.name);
      const legacy = await pushOperations(a.id, syncPushSchema.parse({ schemaVersion: 1, deviceId: "synthetic", operations: [{ operationId: randomUUID(), entityType: "user_exercise", entityId: "exercise", action: "upsert", baseVersion: "0", payload: exercise }] }));
      assert.equal(legacy.results[0].status, "conflict");
      assert.equal((await call("social/drafts", a.jwt, "POST", { id: "draft", data: { body: "private", metadata: null } }, key)).body.error.code, "IDEMPOTENCY_KEY_REUSE");
    });

    await t.test("Legacy completed profiles with optional data missing can edit without resetting completion", async () => {
      const a = await account();
      await pushOperations(a.id, syncPushSchema.parse({ schemaVersion: 1, deviceId: "legacy", operations: [{ operationId: randomUUID(), entityType: "profile", entityId: "profile", action: "upsert", baseVersion: "0", payload: { setupCompleted: true, programSource: "app", focus: null } }] }));
      const edited = await call("me", a.jwt, "PATCH", { baseVersions: { profile: "1" }, profile: { displayName: "Legacy" } });
      assert.equal(edited.status, 200); assert.equal(edited.body.setupCompleted, true); assert.equal(edited.body.profile.ageYears, null);
      assert.notEqual(edited.body.nutritionTargets.estimate.status, "ready");
      assert.deepEqual(edited.body.profile.focusAreas, []);
      assert.equal((await call("programs/recommendations", a.jwt)).body.error.code, "PREFERENCES_REQUIRED");
    });

    await t.test("Legacy focus requests normalize; omission preserves multi-focus and old receipts remain byte-shape compatible", async () => {
      const a = await account(true);
      const legacy = async (baseVersion: string, payload: object) => pushOperations(a.id, syncPushSchema.parse({ schemaVersion: 1, deviceId: "legacy", operations: [{ operationId: randomUUID(), entityType: "profile", entityId: "profile", action: "upsert", baseVersion, payload }] }));
      assert.equal((await legacy("1", { focus: "chest", setupCompleted: true })).results[0].status, "applied");
      assert.deepEqual((await call("me", a.jwt)).body.profile.focusAreas, ["chest"]);
      const key = randomUUID(), input = { baseVersions: { profile: "2" }, profile: { focusAreas: ["chest", "back"] } };
      const saved = await call("me", a.jwt, "PATCH", input, key); assert.equal(saved.status, 200);
      assert.equal((await legacy("3", { displayName: "Old client", setupCompleted: true })).results[0].status, "applied");
      assert.deepEqual((await call("me", a.jwt)).body.profile.focusAreas, ["chest", "back"]);
      const delta = await pullChanges(a.id, (await bootstrap(a.id)).cursor, 100); assert.deepEqual(delta.changes, []);
      const oldInput = { baseVersions: { profile: "4" }, profile: { focus: "arm" } }, oldKey = randomUUID();
      const old = await call("me", a.jwt, "PATCH", oldInput, oldKey); assert.equal(old.status, 200);
      const oldResponse = structuredClone(old.body); delete oldResponse.profile.focusAreas;
      const [receipt] = await db.select().from(schema.operationReceipts).where(eq(schema.operationReceipts.operationId, oldKey));
      await db.update(schema.operationReceipts).set({ result: { ...receipt.result, response: oldResponse } }).where(eq(schema.operationReceipts.operationId, oldKey));
      assert.deepEqual((await call("me", a.jwt, "PATCH", oldInput, oldKey)).body, oldResponse);
      assert.deepEqual((await call("me", a.jwt)).body.profile.focusAreas, ["arm"]);
      assert.equal((await legacy("5", { focus: "unknown", setupCompleted: true })).results[0].status, "applied");
      assert.deepEqual((await call("me", a.jwt)).body.profile.focusAreas, []);
      const conflict = await legacy("6", { focus: "chest", focusAreas: ["back"] }); assert.equal(conflict.results[0].status, "rejected");
      assert.equal((await call("me", a.jwt)).body.profile.version, "6");
    });

    await t.test("Completed recommendation saves the performed snapshot without rebuilding from a changed program", async () => {
      const a = await account(true);
      assert.equal((await call("me", a.jwt, "PATCH", { baseVersions: { profile: "1" }, profile: { focus: "chest", trainingContext: { painAreas: [] } } })).status, 200);
      const recommendations = await call("programs/recommendations", a.jwt); assert.equal(recommendations.status, 200);
      const plan = recommendations.body.programs[0]; assert.ok(plan);
      const input = { id: "recommended-session", source: "recommended", programId: plan.id, mode: plan.mode,
        exerciseSnapshot: plan.exercises, setLog: [], startedAt, finishedAt, recordedOn: date };
      assert.equal((await call("workouts", a.jwt, "POST", { ...input, programId: "missing" })).status, 404);
      // A later preference change must not recalculate the workout actually performed.
      assert.equal((await call("me", a.jwt, "PATCH", { baseVersions: { profile: "2" }, profile: { focus: "leg" } })).status, 200);
      const created = await call("workouts", a.jwt, "POST", input); assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.deepEqual(created.body.item.exerciseSnapshot, plan.exercises);
    });

    await t.test("Legacy active data is retained without adding a resume/progress API or blocking final-only submissions", async () => {
      const a = await account(), p = await setupProgram(a.jwt);
      const input = { schemaVersion: 1, deviceId: "legacy", operations: [{ operationId: randomUUID(), entityType: "workout_session", entityId: "legacy-active", action: "upsert", baseVersion: "0", payload: {
        planId: p.id, mode: "gym", status: "active", startedAt, finishedAt: null, recordedOn: null,
        exerciseSnapshot: [prescription(p.exerciseId)], setLog: [], legacyMetadata: { retained: "legacy-value" },
      } }] };
      assert.equal((await pushOperations(a.id, syncPushSchema.parse(input))).results[0].status, "applied");
      // Soft-deletions during the local workout must not discard the performed history.
      await call(`programs/custom/${p.id}`, a.jwt, "DELETE", { baseVersion: "1" });
      await call(`exercises/custom/${p.exerciseId}`, a.jwt, "DELETE", { baseVersion: "1" });
      const done = await call("workouts", a.jwt, "POST", { id: "finished", source: "custom", programId: p.id, mode: "gym",
        startedAt, finishedAt, recordedOn: date, exerciseSnapshot: [prescription(p.exerciseId)], setLog: [] });
      assert.equal(done.status, 201, JSON.stringify(done.body));
      const old = await call("workouts/legacy-active", a.jwt);
      assert.equal(old.body.item.status, "active"); assert.equal(old.body.item.legacyMetadata.retained, "legacy-value");
      assert.equal(old.body.item.version, "1");
      assert.equal((await call(`dashboard?date=${date}`, a.jwt)).body.activeWorkout, undefined);
    });

    await t.test("Restricted runtime grants support new flows; inactive accounts cannot read, write or replay", async () => {
      const a = await account(true), key = randomUUID(), input = { id: "runtime", data: { body: "Private", metadata: null } };
      await local.exec("CREATE ROLE musmove_runtime NOLOGIN;"); await local.exec(await readFile("scripts/runtime-role-grants.sql", "utf8")); await local.exec("SET ROLE musmove_runtime;");
      try {
        assert.equal((await call("social/drafts", a.jwt, "POST", input, key)).status, 201);
        const profile = await call("me", a.jwt, "PATCH", { baseVersions: { profile: "1" }, profile: { weightKg: 71, focusAreas: ["back", "chest"] } });
        assert.equal(profile.status, 200); assert.deepEqual(profile.body.profile.focusAreas, ["chest", "back"]);
        assert.equal((await call(`statistics?from=${date}&to=${date}`, a.jwt)).status, 200);
        await setupProgram(a.jwt);
        const workout = await call("workouts", a.jwt, "POST", manualWithNewExercises());
        assert.equal(workout.status, 201); assert.equal(workout.body.exercises[0].version, "1");
        const mixed = await call("workouts", a.jwt, "POST", { id: "runtime-mixed", source: "manual", startedAt, finishedAt, recordedOn: date,
          exerciseSnapshot: [{ ...prescription("bench_press"), mode: "gym" }, { ...prescription("pullup"), mode: "calisthenics" }], setLog: [] });
        assert.equal(mixed.status, 201); assert.equal(mixed.body.item.mode, "mixed");
      } finally { await local.exec("RESET ROLE;"); }
      await db.update(schema.users).set({ status: "deletion_requested" }).where(eq(schema.users.id, a.id));
      assert.equal((await call("social/drafts", a.jwt, "POST", input, key)).status, 403);
      assert.equal((await call("social/drafts", a.jwt)).status, 403);
    });
  } finally {
    globals.musmoveDatabase = previous.db; globals.musmovePool = previous.pool; globalThis.fetch = previous.fetch;
    if (previous.auth === undefined) delete process.env.NEON_AUTH_BASE_URL; else process.env.NEON_AUTH_BASE_URL = previous.auth;
    await local.close(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
