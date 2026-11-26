import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import type { Database } from "../../src/db/client";
import * as schema from "../../src/db/schema";
import journal from "../../drizzle/meta/_journal.json";
import { bootstrap, pushOperations } from "../../src/modules/sync/service";
import { entityPayloadSchemas, parseEntityPayload, syncPushSchema } from "../../src/modules/sync/dto";
import { startSnapshot, snapshotPage, snapshotPageSchema } from "../../src/modules/sync/snapshots";
import { completedWorkoutSchema } from "../../src/modules/online/dto";
import { canonicalRunLog, decodePolyline, runInputSchema, runLogSchema } from "../../src/modules/workouts/run";
import { buildRunResultMetrics } from "../../src/modules/workouts/result-metrics";
import { resultMetricsSchema } from "../../src/modules/workouts/measurement";

// Google encoded polyline (precision 1e5), used to build synthetic GPS routes.
function encodePolyline(points: [number, number][]) {
  let out = "", lastLat = 0, lastLng = 0;
  const encode = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) { out += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
    out += String.fromCharCode(v + 63);
  };
  for (const [lat, lng] of points) {
    const la = Math.round(lat * 1e5), ln = Math.round(lng * 1e5);
    encode(la - lastLat); encode(ln - lastLng); lastLat = la; lastLng = ln;
  }
  return out;
}
// Straight eastward synthetic route near Jakarta of roughly `meters` length.
function route(meters: number, points = 500) {
  const step = meters / (points - 1) / (111_320 * Math.cos(-6.2 * Math.PI / 180));
  const list = Array.from({ length: points }, (_, i) => [-6.2, 106.8 + i * step] as [number, number]);
  return { encoding: "polyline5" as const, polyline: encodePolyline(list), pointCount: points };
}
const past = (id: string, day = "2026-11-20") => ({
  id, source: "run", mode: "running", startedAt: `${day}T10:00:00Z`, finishedAt: `${day}T10:30:00Z`, recordedOn: day,
  exerciseSnapshot: [], setLog: [], sessionTiming: { source: "user_reported", durationSeconds: 1800 },
  run: { version: "1", distanceSource: "manual", distanceMeters: 5000 },
});
const live = (id: string, day = "2026-11-21") => ({
  id, source: "run", mode: "running", startedAt: `${day}T06:00:00Z`, finishedAt: `${day}T06:35:00Z`, recordedOn: day,
  exerciseSnapshot: [], setLog: [], sessionTiming: { source: "timer" }, note: "Easy run",
  run: { version: "1", distanceSource: "gps", distanceMeters: 5200, movingSeconds: 1872, route: route(5200),
    splits: [1, 2, 3, 4, 5].map(index => ({ index, distanceMeters: 1000, seconds: 360 })).concat([{ index: 6, distanceMeters: 200, seconds: 72 }]) },
});

test("polyline decoding is exact and rejects truncated, malformed and out-of-range input", () => {
  assert.deepEqual(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@"), [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  assert.throws(() => decodePolyline("_p~iF"), /truncated/);
  assert.throws(() => decodePolyline(encodePolyline([[0, 0], [95, 0]])), /out of range/);
  assert.throws(() => decodePolyline(encodePolyline([[0, 0], [0, 0.001], [0, 0.002]]), 2), /exceeds/);
  const generated = route(5000);
  assert.equal(decodePolyline(generated.polyline).length, generated.pointCount);
});

test("run input distinguishes live gps and manual past runs, with consistent splits only", () => {
  const ok = live("a").run, manual = past("b").run;
  assert.ok(runInputSchema.safeParse(ok).success);
  assert.ok(runInputSchema.safeParse(manual).success);
  for (const invalid of [
    { ...ok, route: undefined }, { ...ok, movingSeconds: undefined },
    { ...manual, route: ok.route }, { ...manual, splits: ok.splits }, { ...manual, movingSeconds: 100 },
    { ...ok, splits: ok.splits.map((s, i) => i === 2 ? { ...s, index: 9 } : s) },
    { ...ok, splits: ok.splits.slice(0, 3) },
    { ...ok, splits: ok.splits.map(s => ({ ...s, seconds: 1000 })) },
    { ...ok, distanceMeters: 0 }, { ...ok, distanceMeters: 200_001 }, { ...ok, movingSeconds: 43_201 },
    { ...ok, avgPaceSecondsPerKm: 300 }, { ...ok, route: { ...ok.route, encoding: "geojson" } },
    { ...ok, route: { ...ok.route, pointCount: 20_001 } }, { ...ok, route: { ...ok.route, polyline: "abc def" } },
  ]) assert.equal(runInputSchema.safeParse(invalid).success, false, JSON.stringify(invalid).slice(0, 120));
});

test("completed workout DTO keeps runs separate from programs, exercises and other modes", () => {
  assert.ok(completedWorkoutSchema.safeParse(live("a")).success);
  assert.ok(completedWorkoutSchema.safeParse(past("b")).success);
  const prescription = { id: "squat", idLabel: "Squat", enLabel: "Squat", requirements: [[]], sets: 1, reps: 8, targetWeightKg: null };
  for (const invalid of [
    { ...live("a"), mode: "gym" }, { ...live("a"), mode: undefined }, { ...live("a"), source: "manual" },
    { ...live("a"), run: undefined }, { ...live("a"), sessionTiming: undefined }, { ...live("a"), programId: "p" },
    { ...live("a"), exerciseSnapshot: [prescription] },
    { ...live("a"), setLog: [{ exerciseId: "squat", setNumber: 1, completed: true, reps: 8, weightKg: null }] },
    { ...live("a"), newExercises: [] },
    { id: "g", source: "manual", mode: "gym", startedAt: "2026-11-21T00:00:00Z", finishedAt: "2026-11-21T00:30:00Z", recordedOn: "2026-11-21", exerciseSnapshot: [prescription], setLog: [], run: past("x").run },
    { id: "g", source: "manual", mode: "gym", startedAt: "2026-11-21T00:00:00Z", finishedAt: "2026-11-21T00:30:00Z", recordedOn: "2026-11-21", exerciseSnapshot: [], setLog: [] },
  ]) assert.equal(completedWorkoutSchema.safeParse(invalid).success, false);
});

test("pace is server-computed from distance and moving time (gps) or reported duration (manual)", () => {
  const manual = past("m"), manualLog = canonicalRunLog(runInputSchema.parse(manual.run), manual.sessionTiming as never, manual.startedAt, manual.finishedAt);
  const metrics = buildRunResultMetrics({ ...manual, sessionTiming: manual.sessionTiming as never }, manualLog);
  assert.deepEqual(metrics.run, { distanceMeters: 5000, distanceSource: "manual", movingSeconds: null, paceBasis: "duration_seconds", avgPaceSecondsPerKm: 360, avgSpeedKmh: 10 });
  assert.equal(metrics.duration.seconds, 1800); assert.equal(metrics.duration.source, "user_reported");
  assert.ok(resultMetricsSchema.safeParse(metrics).success);
  assert.equal(manualLog.hasRoute, false); assert.equal(manualLog.routeBounds, null);

  const gps = live("g"), gpsLog = canonicalRunLog(runInputSchema.parse(gps.run), { source: "timer" }, gps.startedAt, gps.finishedAt);
  const gpsMetrics = buildRunResultMetrics({ ...gps, sessionTiming: { source: "timer" } }, gpsLog);
  assert.equal(gpsMetrics.duration.seconds, 2100);
  assert.equal(gpsMetrics.run.paceBasis, "moving_seconds"); assert.equal(gpsMetrics.run.avgPaceSecondsPerKm, 360);
  assert.ok(runLogSchema.safeParse(gpsLog).success);
  assert.ok(gpsLog.routeBounds && gpsLog.routeBounds.south === -6.2 && gpsLog.routeBounds.west === 106.8 && gpsLog.routeBounds.east > 106.84);
  assert.ok(Math.abs(gpsLog.routeDistanceMeters! - 5200) < 60);

  assert.throws(() => canonicalRunLog(runInputSchema.parse(gps.run), { source: "user_reported", durationSeconds: 2000 }, gps.startedAt, gps.finishedAt), /timer/);
  assert.throws(() => canonicalRunLog(runInputSchema.parse(manual.run), { source: "timer" }, manual.startedAt, manual.finishedAt), /user_reported/);
  assert.throws(() => canonicalRunLog(runInputSchema.parse({ ...gps.run, movingSeconds: 2101, splits: [] }), { source: "timer" }, gps.startedAt, gps.finishedAt), /movingSeconds/);
  assert.throws(() => canonicalRunLog(runInputSchema.parse({ ...gps.run, route: route(2000), splits: [] }), { source: "timer" }, gps.startedAt, gps.finishedAt), /25%/);
  assert.throws(() => canonicalRunLog(runInputSchema.parse({ ...gps.run, route: { ...gps.run.route, pointCount: 499 } }), { source: "timer" }, gps.startedAt, gps.finishedAt), /pointCount/);
});

test("legacy sync/demo cannot create running sessions; stored shape is enforced", () => {
  const gps = live("g"), runLog = canonicalRunLog(runInputSchema.parse(gps.run), { source: "timer" }, gps.startedAt, gps.finishedAt);
  const stored = { planId: "run", mode: "running", status: "completed", startedAt: gps.startedAt, finishedAt: gps.finishedAt, recordedOn: gps.recordedOn,
    exerciseSnapshot: [], setLog: [], legacyMetadata: { source: "run" }, runLog };
  assert.ok(entityPayloadSchemas.workout_session.safeParse(stored).success);
  assert.throws(() => parseEntityPayload("workout_session", stored));
  for (const invalid of [{ ...stored, runLog: null }, { ...stored, status: "active", finishedAt: null }, { ...stored, legacyMetadata: { source: "manual" } },
    { ...stored, mode: "gym" }]) assert.equal(entityPayloadSchemas.workout_session.safeParse(invalid).success, false);
});

test("0039 adds running without touching existing workouts, receipts or training_mode, and enforces the running shape", async () => {
  const local = new PGlite();
  try {
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
    const when = journal.entries.find(e => e.tag === "0039_running_workouts")!.when;
    const index = migrations.findIndex(m => m.folderMillis === when); assert.ok(index > 0);
    for (const migration of migrations.slice(0, index)) await local.exec(migration.sql.join("\n"));
    const userId = randomUUID();
    await local.query("INSERT INTO users(id,issuer,subject) VALUES($1::uuid,$2,$1::text)", [userId, "synthetic"]);
    const snapshot = [{ id: "squat", idLabel: "Squat", enLabel: "Squat", requirements: [[]], sets: 1, reps: 8, targetWeightKg: null }];
    await local.query(`INSERT INTO workout_sessions(user_id,id,plan_id,mode,status,started_at,finished_at,recorded_on,exercise_snapshot,set_log,legacy_metadata,version)
      VALUES($1,'old','record','gym','completed','2026-11-01T00:00:00Z','2026-11-01T00:30:00Z','2026-11-01',$2::jsonb,'[]'::jsonb,'{"source":"record"}'::jsonb,4)`, [userId, JSON.stringify(snapshot)]);
    await local.query("INSERT INTO operation_receipts(user_id,operation_id,request_hash,result) VALUES($1,$2,$3,$4::jsonb)", [userId, randomUUID(), "0".repeat(64), JSON.stringify({ kind: "old", response: { item: { mode: "gym" } } })]);
    const columns = "id,plan_id,mode,status,started_at,finished_at,recorded_on,exercise_snapshot,set_log,legacy_metadata,result_metrics,version,updated_at,deleted_at";
    const before = (await local.query(`SELECT ${columns} FROM workout_sessions`)).rows;
    const receipts = (await local.query("SELECT * FROM operation_receipts")).rows;
    await local.exec("BEGIN;"); await local.exec(migrations[index].sql.join("\n")); await local.exec("COMMIT;");
    assert.deepEqual((await local.query(`SELECT ${columns} FROM workout_sessions`)).rows, before);
    assert.deepEqual((await local.query("SELECT * FROM operation_receipts")).rows, receipts);
    assert.equal((await local.query<{ run_log: unknown }>("SELECT run_log FROM workout_sessions")).rows[0].run_log, null);
    const enums = await local.query<{ typname: string; values: string[] }>(`SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
      FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname IN ('training_mode','workout_mode') GROUP BY t.typname`);
    assert.deepEqual(enums.rows.find(r => r.typname === "training_mode")!.values, ["gym", "calisthenics"]);
    assert.deepEqual(enums.rows.find(r => r.typname === "workout_mode")!.values, ["gym", "calisthenics", "mixed", "running"]);
    const insert = (id: string, mode: string, exercises: string, runLog: string | null, source = "run", setLog = "[]") => local.query(`INSERT INTO workout_sessions(user_id,id,plan_id,mode,status,started_at,finished_at,recorded_on,exercise_snapshot,set_log,legacy_metadata,run_log,version)
      VALUES($1,$2,'run',$3,'completed','2026-11-02T00:00:00Z','2026-11-02T00:30:00Z','2026-11-02',$4::jsonb,$7::jsonb,$5::jsonb,$6::jsonb,1)`, [userId, id, mode, exercises, JSON.stringify({ source }), runLog, setLog]);
    await insert("run-ok", "running", "[]", JSON.stringify({ version: "1" }));
    await assert.rejects(insert("run-no-log", "running", "[]", null));
    await assert.rejects(insert("run-exercise", "running", JSON.stringify(snapshot), JSON.stringify({ version: "1" })));
    await assert.rejects(insert("run-source", "running", "[]", JSON.stringify({ version: "1" }), "manual"));
    await assert.rejects(insert("run-sets", "running", "[]", JSON.stringify({ version: "1" }), "run", JSON.stringify([{ exerciseId: "x", setNumber: 1, completed: true, reps: 1, weightKg: null }])));
    await assert.rejects(insert("run-huge", "running", "[]", JSON.stringify({ polyline: "a".repeat(262_200) })));
    await assert.rejects(insert("gym-log", "gym", JSON.stringify(snapshot), JSON.stringify({ version: "1" }), "record"));
    await assert.rejects(insert("gym-empty", "gym", "[]", null, "record"));
    await assert.rejects(local.query("UPDATE training_preferences SET mode='running'"));
  } finally { await local.close(); }
});

test("Running workouts through the online API: save, retry, detail, list, comparison, statistics and legacy isolation", async t => {
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
  const jwk = { ...await exportJWK(pair.publicKey), kid: "running-local", alg: "EdDSA", use: "sig" };
  const server = createServer((req, res) => req.url === "/auth/.well-known/jwks.json" ? res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ keys: [jwk] })) : res.writeHead(404).end());
  try {
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "drizzle", migrationsTable: "migrations" });
    globals.musmoveDatabase = db as unknown as Database;
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const issuer = `http://127.0.0.1:${address.port}`; process.env.NEON_AUTH_BASE_URL = `${issuer}/auth`;
    const routes: Record<string, Record<string, unknown>> = {
      me: await import("../../app/api/v1/me/route"),
      workouts: await import("../../app/api/v1/workouts/route"), "workouts/:id": await import("../../app/api/v1/workouts/[id]/route"),
      statistics: await import("../../app/api/v1/statistics/route"), dashboard: await import("../../app/api/v1/dashboard/route"),
    };
    async function call(path: string, jwt: string, method = "GET", body?: unknown, key: string | null = randomUUID()) {
      const pathname = path.split("?")[0];
      const template = routes[pathname] ? pathname : "workouts/:id";
      const id = template === "workouts/:id" ? pathname.slice("workouts/".length) : "";
      const handler = routes[template][method] as (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
      const response = await handler(new Request(`https://api.example.test/api/v1/${path}`, {
        method, headers: { "content-type": "application/json", authorization: `Bearer ${jwt}`, ...(key ? { "idempotency-key": key } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }), { params: Promise.resolve({ id }) });
      return { status: response.status, body: response.status === 204 ? null : await response.json() };
    }
    async function account() {
      const jwt = await new SignJWT({ role: "authenticated", banned: false }).setProtectedHeader({ alg: "EdDSA", kid: jwk.kid })
        .setIssuer(issuer).setAudience(issuer).setSubject(randomUUID()).setIssuedAt().setExpirationTime("15m").sign(pair.privateKey);
      const me = await call("me", jwt); assert.equal(me.status, 200);
      return { jwt, id: me.body.user.id as string };
    }
    const count = async (table: string, userId: string, where = "true") =>
      (await local.query<{ n: number }>(`SELECT count(*)::integer AS n FROM ${table} WHERE user_id=$1 AND ${where}`, [userId])).rows[0].n;

    await t.test("past and live runs persist with server pace, route, comparison and polyline-free list/receipt", async () => {
      const a = await account(), b = await account();
      const first = await call("workouts", a.jwt, "POST", past("run-past"));
      assert.equal(first.status, 201, JSON.stringify(first.body));
      assert.equal(first.body.item.mode, "running"); assert.equal(first.body.item.planId, "run");
      assert.deepEqual(first.body.item.exerciseSnapshot, []); assert.deepEqual(first.body.item.setLog, []); assert.deepEqual(first.body.exercises, []);
      assert.equal(first.body.item.resultMetrics.version, "3"); assert.equal(first.body.item.resultMetrics.run.avgPaceSecondsPerKm, 360);
      assert.equal(first.body.item.runLog.hasRoute, false); assert.equal(first.body.item.runLog.route, null);
      assert.equal(first.body.comparison.run.previousWorkout, null); assert.equal(first.body.comparison.run.distanceMeters.delta, null);

      const key = randomUUID(), input = live("run-live");
      const saved = await call("workouts", a.jwt, "POST", input, key);
      assert.equal(saved.status, 201, JSON.stringify(saved.body));
      assert.deepEqual(saved.body.item.runLog.route, input.run.route);
      assert.equal(saved.body.item.runLog.routeBounds.south, -6.2);
      assert.equal(saved.body.item.legacyMetadata.note, "Easy run");
      assert.equal(saved.body.item.resultMetrics.run.paceBasis, "moving_seconds");
      assert.equal(saved.body.comparison.run.previousWorkout.id, "run-past");
      assert.equal(saved.body.comparison.run.distanceMeters.delta, 200);
      assert.equal(saved.body.comparison.run.avgPaceSecondsPerKm.delta, 0);
      assert.equal(saved.body.comparison.run.durationSeconds.delta, 300);

      const receipt = (await local.query<{ result: { response: { item: { runLog: Record<string, unknown> } } } }>(
        "SELECT result FROM operation_receipts WHERE user_id=$1 AND operation_id=$2", [a.id, key])).rows[0].result;
      assert.equal("route" in receipt.response.item.runLog, false);
      assert.equal(receipt.response.item.runLog.hasRoute, true);
      assert.ok(!JSON.stringify(receipt).includes(input.run.route.polyline));
      assert.deepEqual((await call("workouts", a.jwt, "POST", input, key)).body, saved.body, "exact retry restores the polyline");
      assert.equal((await call("workouts", a.jwt, "POST", { ...input, note: "changed" }, key)).body.error.code, "IDEMPOTENCY_KEY_REUSE");
      assert.equal(await count("workout_sessions", a.id), 2);

      const detail = await call("workouts/run-live", a.jwt, "GET", undefined, null);
      assert.equal(detail.status, 200); assert.deepEqual(detail.body.item.runLog, saved.body.item.runLog);
      assert.equal(detail.body.comparison.run.previousWorkout.id, "run-past");
      assert.equal((await call("workouts/run-live", b.jwt, "GET", undefined, null)).status, 404);

      const list = await call("workouts?mode=running", a.jwt, "GET", undefined, null);
      assert.equal(list.status, 200); assert.deepEqual(list.body.items.map((w: { id: string }) => w.id), ["run-live", "run-past"]);
      assert.equal("route" in list.body.items[0].runLog, false); assert.equal(list.body.items[0].runLog.hasRoute, true);
      assert.equal(list.body.items[0].runLog.routeBounds.south, -6.2);
      assert.equal((await call("workouts?mode=gym", a.jwt, "GET", undefined, null)).body.items.length, 0);

      const stats = await call("statistics?from=2026-11-01&to=2026-11-30", a.jwt, "GET", undefined, null);
      assert.equal(stats.status, 200);
      assert.equal(stats.body.totals.completedWorkouts, 2); assert.equal(stats.body.totals.runningWorkouts, 2);
      assert.equal(stats.body.totals.runningDistanceMeters, 10200); assert.equal(stats.body.totals.durationMinutes, 65);
      assert.equal(stats.body.totals.completedSets, 0);
      assert.equal((await call("dashboard?date=2026-11-21", a.jwt, "GET", undefined, null)).body.workoutDays[0].completed, 1);

      // Legacy sync never sees running sessions: no change feed, bootstrap or snapshot items.
      assert.equal(await count("sync_changes", a.id, "entity_type='workout_session'"), 0);
      assert.equal((await bootstrap(a.id)).entities.workout_session.length, 0);
      const snapshotId = randomUUID(); await startSnapshot(a.id, snapshotId);
      const page = await snapshotPage(a.id, snapshotPageSchema.parse({ snapshotId, limit: "50" }));
      assert.ok(!page.items.some(item => item.entityType === "workout_session"));
      const pushed = await pushOperations(a.id, syncPushSchema.parse({ schemaVersion: 1, deviceId: "legacy", operations: [{
        operationId: randomUUID(), entityType: "workout_session", entityId: "legacy-run", action: "upsert", baseVersion: "0",
        payload: { planId: "run", mode: "running", status: "completed", startedAt: input.startedAt, finishedAt: input.finishedAt, recordedOn: input.recordedOn,
          exerciseSnapshot: [], setLog: [], legacyMetadata: { source: "run" }, runLog: saved.body.item.runLog } }] }));
      assert.equal(pushed.results[0].status, "rejected");

      const removed = await call("workouts/run-past", a.jwt, "DELETE", { baseVersion: "1" });
      assert.equal(removed.status, 200, JSON.stringify(removed.body));
      assert.equal(await count("sync_changes", a.id, "entity_type='workout_session'"), 0);
      assert.equal((await call("workouts/run-live", a.jwt, "GET", undefined, null)).body.comparison.run.previousWorkout, null);
    });

    await t.test("invalid runs reject 400 atomically and oversized bodies reject 413", async () => {
      const a = await account();
      const base = live("bad");
      const cases = [
        { ...base, sessionTiming: { source: "user_reported", durationSeconds: 2000 } },
        { ...base, run: { ...base.run, route: route(2000), splits: [] } },
        { ...base, run: { ...base.run, movingSeconds: 2101, splits: [] } },
        { ...base, run: { ...base.run, route: { ...base.run.route, pointCount: 10 } } },
        { ...base, run: { ...base.run, route: { ...base.run.route, polyline: "_p~iF" , pointCount: 2 } } },
        { ...past("bad-past"), sessionTiming: { source: "timer" } },
        { ...base, exerciseSnapshot: [{ id: "squat", idLabel: "S", enLabel: "S", requirements: [[]], sets: 1, reps: 8, targetWeightKg: null }] },
      ];
      for (const invalid of cases) assert.equal((await call("workouts", a.jwt, "POST", invalid)).status, 400, JSON.stringify(invalid).slice(0, 200));
      const huge = { ...base, run: { ...base.run, route: { encoding: "polyline5", polyline: "?".repeat(200_000), pointCount: 20_000 }, splits: [] } };
      assert.equal((await call("workouts", a.jwt, "POST", { ...huge, note: "x".repeat(70_000) })).status, 413);
      for (const name of ["workout_sessions", "operation_receipts", "sync_changes"]) assert.equal(await count(name, a.id), 0);
    });
  } finally {
    globals.musmoveDatabase = previous.db; globals.musmovePool = previous.pool; globalThis.fetch = previous.fetch;
    if (previous.auth === undefined) delete process.env.NEON_AUTH_BASE_URL; else process.env.NEON_AUTH_BASE_URL = previous.auth;
    await local.close(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
