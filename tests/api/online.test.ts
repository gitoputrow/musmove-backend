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
import { accountPatchSchema, versionSchema } from "../../src/modules/online/dto";

const exercise = { mode: "gym", name: "Synthetic exercise", defaultSets: 2, defaultReps: 8 };
const prescription = (id: string) => ({ id, idLabel: "forged", enLabel: "forged", requirements: [["forged"]], sets: 2, reps: 8, targetWeightKg: null });
const program = (exerciseId: string, weekday: number | null = null) => ({ mode: "gym", name: "Synthetic program", durationMinutes: 30, weekday, exercisePrescriptions: [prescription(exerciseId)] });
const onboarding = () => ({ baseVersions: { profile: "0", trainingPreferences: "0" }, profile: { ageYears: 25, goal: "bulk", dailyActivity: "light", trainingFrequency: 3, sessionMinutes: 60, programSource: "app", focus: "full", motivationEnabled: false, motivationReason: "health", gender: "non_binary", weightKg: 70, heightCm: 175, formulaSex: "male", trainingContext: { painAreas: ["knee"], recoveryStatus: "recovered" } }, trainingPreferences: { mode: "gym", equipment: ["dumbbell", "bench"], noEquipment: false } });
const startedAt = "2026-10-20T00:00:00Z", finishedAt = "2026-10-20T00:30:00Z", date = "2026-10-20";

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

    await t.test("All added read/write routes require authentication and reject ownership in input", async () => {
      for (const [path, methods] of Object.entries(routes)) {
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
      const input = { baseVersions: { profile: "1", trainingPreferences: "1" }, profile: { weightKg: 80 }, trainingPreferences: { mode: "calisthenics", equipment: ["dumbbell"] } };
      assert.equal((await call("me", a.jwt, "PATCH", input)).status, 400);
      input.trainingPreferences.mode = "gym";
      await local.exec("CREATE FUNCTION online_fail_preferences() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER online_fail BEFORE UPDATE ON training_preferences FOR EACH ROW EXECUTE FUNCTION online_fail_preferences();");
      const errorLog = console.error; console.error = () => {};
      try { assert.equal((await call("me", a.jwt, "PATCH", input, key)).status, 500); }
      finally { console.error = errorLog; await local.exec("DROP TRIGGER online_fail ON training_preferences; DROP FUNCTION online_fail_preferences();"); }
      assert.equal((await call("me", a.jwt)).body.profile.weightKg, 70); assert.equal(await count("nutrition_estimates", a.id), 1);
      assert.equal(await count("operation_receipts", a.id), 1); assert.equal(await count("sync_changes", a.id), 2);
      assert.equal((await call("me", a.jwt, "PATCH", input, key)).status, 200);
    });

    await t.test("Program plus new exercises is atomic; schedule conflicts roll back every write", async () => {
      const a = await account(), one = await setupProgram(a.jwt, 2);
      assert.equal(one.item.exercisePrescriptions[0].idLabel, exercise.name);
      const newId = `exercise-${randomUUID()}`;
      const result = await call("programs/custom", a.jwt, "POST", { id: "collision", data: program(newId, 2), newExercises: [{ id: newId, data: exercise }] });
      assert.equal(result.status, 409); assert.equal(await count("user_exercises", a.id), 1); assert.equal(await count("custom_programs", a.id), 1);
      const invalid = await call("programs/custom", a.jwt, "POST", { id: "invalid", data: program("missing"), newExercises: [{ id: "rolled-back", data: exercise }] });
      assert.equal(invalid.status, 400); assert.equal(await count("user_exercises", a.id), 1);
      const edited = await call(`programs/custom/${one.id}`, a.jwt, "PATCH", { baseVersion: "1", changes: { name: "Renamed", weekday: 3 } });
      assert.equal(edited.status, 200, JSON.stringify(edited.body)); assert.equal(edited.body.item.version, "2");
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
      assert.equal(stats.body.totals.durationMinutes, 30); assert.equal((await call(`statistics?from=${date}&to=${date}`, b.jwt)).body.totals.completedWorkouts, 0);
      assert.equal((await call("statistics?from=2020-01-01&to=2026-10-20", a.jwt)).status, 400);
      assert.equal((await call("workouts", b.jwt, "POST", manual)).status, 400, "Foreign custom exercise cannot be referenced");
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
        assert.equal((await call("me", a.jwt, "PATCH", { baseVersions: { profile: "1" }, profile: { weightKg: 71 } })).status, 200);
        assert.equal((await call(`statistics?from=${date}&to=${date}`, a.jwt)).status, 200);
        await setupProgram(a.jwt);
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
