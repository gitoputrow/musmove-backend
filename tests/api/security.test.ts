import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { ApiError } from "../../src/lib/api-error";
import { assertSafeJson, readBoundedBody } from "../../src/lib/body";
import { apiJson, publicHandler, readJson } from "../../src/lib/http";
import { queryParameters } from "../../src/lib/query";
import { isStrongSecret, productionConfigurationIssues } from "../../src/lib/security/config";
import { consumeRateLimit, enforceIpLimit, enforceUserLimit, RATE_LIMIT_SQL } from "../../src/lib/security/rate-limit";
import { syncPushSchema } from "../../src/modules/sync/dto";
import { decodeCursor, encodeCursor } from "../../src/modules/sync/encoding";
import { workoutQuerySchema, listWorkouts } from "../../src/modules/workouts/service";

const status = (expected: number) => (error: unknown) => error instanceof ApiError && error.status === expected;
const request = (body: BodyInit, headers: Record<string, string> = {}) => new Request("http://localhost/api/v1/sync/push", {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body,
});

test("JSON body rejects MIME spoofing, invalid UTF8, compressed, oversized and unsafe structures", async () => {
  assert.deepEqual(await readJson(request('{"valid":true}')), { valid: true });
  await assert.rejects(readJson(request('{}', { "content-type": "application/jsonp" })), status(415));
  await assert.rejects(readJson(request('{}', { "content-encoding": "gzip" })), status(415));
  await assert.rejects(readJson(request('{bad}')), status(400));
  await assert.rejects(readJson(request(new Uint8Array([0xff]))), status(400));
  await assert.rejects(readJson(request('12345'), 4), status(413));
  await assert.rejects(readJson(request('{}', { "content-length": "-1" })), status(413));
  for (const body of ['{"__proto__":{"polluted":true}}', '{"value":"\\u0000"}', '{"value":1e9999}', '['.repeat(34) + '0' + ']'.repeat(34)]) {
    await assert.rejects(readJson(request(body)), status(400));
  }
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.throws(() => assertSafeJson({ tooBig: "x".repeat(65536) }), status(413));
});

test("Chunked/slow uploads cannot hang even if stream cancellation never settles", async () => {
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(5)); }, cancel() { return new Promise(() => {}); } });
  const streamed = new Request("http://localhost", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  await assert.rejects(readBoundedBody(streamed, 4, 20), status(413));
  const slow = new Request("http://localhost", { method: "POST", body: new ReadableStream({ pull() { return new Promise(() => {}); } }), duplex: "half" } as RequestInit);
  await assert.rejects(readBoundedBody(slow, 10, 20), status(408));
});

test("Security headers, safe errors and CORS stay present on denied and successful requests", async () => {
  const prior = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://mobile.example.test";
  try {
    const handler = publicHandler(async () => apiJson({ ok: true }));
    const allowed = await handler(new Request("http://localhost", { headers: { origin: process.env.APP_ORIGIN } }));
    assert.equal(allowed.headers.get("access-control-allow-origin"), process.env.APP_ORIGIN);
    assert.equal(allowed.headers.get("access-control-allow-credentials"), null);
    assert.equal(allowed.headers.get("vary"), "Origin");
    assert.equal(allowed.headers.get("x-content-type-options"), "nosniff");
    assert.equal(allowed.headers.get("x-frame-options"), "DENY");
    const denied = await handler(new Request("http://localhost", { headers: { origin: "https://attacker.test" } }));
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
    assert.equal(denied.headers.get("vary"), "Origin");
    const limited = await publicHandler(async () => { throw new ApiError(429, "RATE_LIMITED", "Retry later"); })(new Request("http://localhost"));
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
    assert.match(limited.headers.get("cache-control")!, /no-store/);
    assert.throws(() => apiJson({ huge: "x".repeat(3 * 1024 * 1024) }), status(413));
  } finally { if (prior === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = prior; }
});

test("Production refuses weak secrets, cleartext transports and leaked public secrets", () => {
  const valid = { DATABASE_URL: "postgresql://runtime:password@db.example.test/db?sslmode=verify-full", NEON_AUTH_BASE_URL: "https://auth.example.test/db/auth",
    SYNC_CURSOR_SECRET: randomBytes(32).toString("hex"), API_RATE_LIMIT_SECRET: randomBytes(32).toString("hex") };
  assert.deepEqual(productionConfigurationIssues(valid), []);
  assert.equal(isStrongSecret("replace-with-at-least-32-random-characters"), false);
  assert.equal(isStrongSecret("x".repeat(64)), false);
  for (const override of [{ SYNC_CURSOR_SECRET: "" }, { API_RATE_LIMIT_SECRET: valid.SYNC_CURSOR_SECRET },
    { DATABASE_URL: "postgres://runtime:password@db.test/db?sslmode=no-verify" }, { APP_ORIGIN: "http://localhost:3000" },
    { NEON_AUTH_BASE_URL: "http://auth.example.test/auth" }, { NEXT_PUBLIC_DATABASE_URL: valid.DATABASE_URL },
    { EQUIPMENT_VISION_URL: "http://127.0.0.1:8100", EQUIPMENT_VISION_TOKEN: randomBytes(32).toString("hex") }]) {
    assert.ok(productionConfigurationIssues({ ...valid, ...override }).length);
  }
});

test("Cursors are account-bound, canonical and reject oversized signed sequences", () => {
  const prior = process.env.SYNC_CURSOR_SECRET;
  process.env.SYNC_CURSOR_SECRET = randomBytes(32).toString("hex");
  try {
    const payload = { userId: randomUUID(), epoch: randomUUID(), sequence: "123" };
    const cursor = encodeCursor(payload);
    assert.deepEqual(decodeCursor(cursor, payload.userId), payload);
    for (const value of [cursor + ".", cursor + ".extra", cursor.slice(0, -1), "x".repeat(3000)]) assert.throws(() => decodeCursor(value, payload.userId));
    assert.throws(() => decodeCursor(cursor, randomUUID()));
    assert.throws(() => decodeCursor(encodeCursor({ ...payload, sequence: "9".repeat(100) }), payload.userId));
    assert.throws(() => syncPushSchema.parse({ schemaVersion: 1, deviceId: "test", operations: [{ action: "delete", baseVersion: "9".repeat(100), entityId: "id", entityType: "meal_entry", operationId: randomUUID() }] }));
  } finally { if (prior === undefined) delete process.env.SYNC_CURSOR_SECRET; else process.env.SYNC_CURSOR_SECRET = prior; }
});

test("Strict query parsing bounds pagination and ignores spoofed IP headers outside Vercel", async () => {
  for (const query of ["userId=spoof", "limit=2&limit=3", "__proto__=x"]) {
    assert.throws(() => workoutQuerySchema.parse(queryParameters(`http://localhost/?${query}`)));
  }
  const largeCursor = Buffer.from(JSON.stringify({ offset: 2147483647 })).toString("base64url");
  await assert.rejects(listWorkouts(randomUUID(), workoutQuerySchema.parse({ cursor: largeCursor })), status(400));
  const prior = process.env.VERCEL;
  process.env.VERCEL = "1";
  try { await assert.rejects(enforceIpLimit(new Request("http://localhost", { headers: { "x-forwarded-for": "1.2.3.4" } })), status(503)); }
  finally { if (prior === undefined) delete process.env.VERCEL; else process.env.VERCEL = prior; }
});

test("User policies apply even to differently encoded URLs; local counters are bounded", async () => {
  const id = randomUUID();
  const req = new Request("http://localhost/api/v1/equipment/recogni%7Ae", { method: "POST" });
  for (let i = 0; i < 5; i++) await enforceUserLimit(req, id, "scan");
  await assert.rejects(enforceUserLimit(req, id, "scan"), status(429));
  const identity = randomUUID();
  await consumeRateLimit("unit", identity, 1);
  await assert.rejects(consumeRateLimit("unit", identity, 1), status(429));
});

test("PostgreSQL limiter enforces one shared atomic quota, expiry, and bounded stale cleanup", async () => {
  const client = new PGlite();
  try {
    await client.exec((await readFile("drizzle/0015_shared_api_rate_limits.sql", "utf8")).replaceAll("--> statement-breakpoint", ""));
    const key = randomBytes(32).toString("hex");
    const results = await Promise.all(Array.from({ length: 12 }, () => client.query(RATE_LIMIT_SQL, [key, 60000, 5])));
    assert.equal(results.filter((result) => result.rows.length).length, 5);
    assert.equal((await client.query<{ requests: number }>("SELECT requests FROM api_rate_limits WHERE bucket_key=$1", [key])).rows[0].requests, 5);
    await client.query("UPDATE api_rate_limits SET reset_at=now()-interval '2 days' WHERE bucket_key=$1", [key]);
    assert.equal((await client.query(RATE_LIMIT_SQL, [key, 60000, 5])).rows.length, 1);
    const oldKey = randomBytes(32).toString("hex");
    await client.query("INSERT INTO api_rate_limits VALUES ($1,1,now()-interval '2 days')", [oldKey]);
    await client.query(RATE_LIMIT_SQL, [key, 60000, 5]);
    assert.equal((await client.query("SELECT * FROM api_rate_limits WHERE bucket_key=$1", [oldKey])).rows.length, 0);
  } finally { await client.close(); }
});

test("Reviewed runtime grants allow app CRUD but deny catalog writes and DDL", async () => {
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite();
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle", migrationsSchema: "drizzle", migrationsTable: "migrations" });
    await client.exec("CREATE ROLE musmove_runtime NOLOGIN;");
    await client.exec(await readFile("scripts/runtime-role-grants.sql", "utf8"));
    await client.exec("SET ROLE musmove_runtime;");
    assert.equal((await client.query("SELECT id FROM meal_catalog WHERE id='tkpi-ap001'")).rows.length, 1);
    await client.query("INSERT INTO users (id,issuer,subject) VALUES ($1,$2,$3)", [randomUUID(), "https://security.test", randomUUID()]);
    await client.query(RATE_LIMIT_SQL, [randomBytes(32).toString("hex"), 60000, 5]);
    await assert.rejects(client.exec("UPDATE meal_catalog SET calories_kcal=0 WHERE id='tkpi-ap001'"));
    await assert.rejects(client.exec("CREATE TABLE public.unauthorized_ddl (id integer)"));
  } finally { await client.close(); }
});
