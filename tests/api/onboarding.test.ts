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
import { completeOnboardingSchema } from "../../src/modules/onboarding/dto";
import { bootstrap, pullChanges, pushOperations } from "../../src/modules/sync/service";
import { syncPushSchema } from "../../src/modules/sync/dto";

const payload = () => ({
  baseVersions: { profile: "0", trainingPreferences: "0" },
  profile: {
    ageYears: 25, goal: "bulk", dailyActivity: "light", trainingFrequency: 3,
    sessionMinutes: 45, programSource: "app", focus: "full",
    motivationEnabled: true, motivationReason: "health",
  },
  trainingPreferences: { mode: "gym", equipment: ["dumbbell"], noEquipment: false },
});

test("Final-only onboarding DTO rejects invalid versions without throwing non-validation errors", () => {
  for (const version of ["abc", "01", "-1", "", "9223372036854775808", "9".repeat(100)]) {
    const input = payload(); input.baseVersions.profile = version;
    assert.equal(completeOnboardingSchema.safeParse(input).success, false);
  }
  const parsed = completeOnboardingSchema.parse({ ...payload(), profile: { ...payload().profile, goal: "maintain", trainingFrequency: 7 } });
  assert.equal(parsed.profile.goal, "maintenance"); assert.equal(parsed.profile.trainingFrequency, 7);
  assert.equal(completeOnboardingSchema.safeParse({ ...payload(), profile: { ...payload().profile, setupCompleted: true } }).success, false);
  assert.equal(completeOnboardingSchema.safeParse({ ...payload(), profile: { ...payload().profile, focus: null } }).success, false);
  assert.equal(completeOnboardingSchema.safeParse({ ...payload(), profile: { ...payload().profile, programSource: "custom", focus: null } }).success, true);
});

test("Onboarding routes use isolated PostgreSQL and synthetic signed identities only", async t => {
  Object.assign(process.env, { NODE_ENV: "test", SYNC_CURSOR_SECRET: randomBytes(32).toString("hex") });
  delete process.env.VERCEL;
  const local = new PGlite(), db = drizzle(local, { schema });
  const globalDb = globalThis as unknown as { musmoveDatabase?: Database; musmovePool?: unknown };
  const previousDb = globalDb.musmoveDatabase, previousPool = globalDb.musmovePool, previousFetch = globalThis.fetch;
  const previousAuth = process.env.NEON_AUTH_BASE_URL;
  globalDb.musmovePool = { query() { throw new Error("External database forbidden"); }, end: async () => {} };
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== "127.0.0.1") throw new Error("External network forbidden");
    return previousFetch(input, init);
  };
  const pair = await generateKeyPair("EdDSA");
  const jwk = { ...await exportJWK(pair.publicKey), kid: "onboarding-local", alg: "EdDSA", use: "sig" };
  const server = createServer((req, res) => req.url === "/auth/.well-known/jwks.json"
    ? res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ keys: [jwk] }))
    : res.writeHead(404).end());
  try {
    await migrate(db, { migrationsFolder: "drizzle", migrationsSchema: "drizzle", migrationsTable: "migrations" });
    globalDb.musmoveDatabase = db as unknown as Database;
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const issuer = `http://127.0.0.1:${address.port}`;
    process.env.NEON_AUTH_BASE_URL = `${issuer}/auth`;
    const me = await import("../../app/api/v1/me/route");
    const complete = await import("../../app/api/v1/onboarding/complete/route");
    const request = (path: string, jwt?: string, body?: unknown, key?: string) => new Request(`https://api.example.test/api/v1/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(jwt ? { authorization: `Bearer ${jwt}` } : {}), ...(key ? { "idempotency-key": key } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    async function account() {
      const jwt = await new SignJWT({ role: "authenticated", banned: false }).setProtectedHeader({ alg: "EdDSA", kid: jwk.kid })
        .setIssuer(issuer).setAudience(issuer).setSubject(randomUUID()).setIssuedAt().setExpirationTime("15m").sign(pair.privateKey);
      const response = await me.GET(request("me", jwt)); assert.equal(response.status, 200);
      const body = await response.json(); return { jwt, id: body.user.id as string, body };
    }
    const a = await account(), b = await account();
    const submit = (jwt: string, body: unknown = payload(), key = randomUUID()) => complete.POST(request("onboarding/complete", jwt, body, key));
    const count = async (table: string, id: string) => (await local.query<{ n: number }>(`SELECT count(*)::integer n FROM ${table} WHERE user_id=$1`, [id])).rows[0].n;
    const legacyPush = (id: string, profile: object, baseVersion = "0") => pushOperations(id, syncPushSchema.parse({
      schemaVersion: 1, deviceId: "synthetic-onboarding", operations: [{ operationId: randomUUID(), entityType: "profile", entityId: "profile", action: "upsert", baseVersion, payload: profile }],
    }));

    await t.test("GET /me is additive, binary, private and does not persist drafts", async () => {
      assert.equal(a.body.setupCompleted, false); assert.equal(a.body.profile, null); assert.equal(a.body.trainingPreferences, null);
      assert.deepEqual(a.body.versions, { profile: "0", trainingPreferences: "0" });
      for (const table of ["profiles", "training_preferences", "nutrition_estimates"]) assert.equal(await count(table, a.id), 0);
      const response = await me.GET(request("me", a.jwt)); assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.ok(!JSON.stringify(await response.json()).includes("resumeStep"));
      assert.equal((await me.GET(request("me"))).status, 401);
      assert.equal((await complete.POST(request("onboarding/complete", undefined, payload(), randomUUID()))).status, 401);
      const options = await complete.OPTIONS(request("onboarding/complete"));
      assert.ok(options.headers.get("access-control-allow-headers")?.toLowerCase().includes("idempotency-key"));
    });

    await t.test("Final submission atomically stores profile/preferences/nutrition and legacy stream", async () => {
      const cursor = (await bootstrap(a.id)).cursor;
      const input = { ...payload(), profile: { ...payload().profile, weightKg: 70, heightCm: 175, formulaSex: "male", gender: "prefer_not_to_say" } };
      const key = randomUUID(); const first = await submit(a.jwt, input, key); assert.equal(first.status, 200);
      const saved = await first.json(); assert.equal(saved.setupCompleted, true); assert.equal(saved.profile.setupCompleted, true);
      assert.deepEqual(saved.versions, { profile: "1", trainingPreferences: "1" });
      assert.equal(saved.nutritionTargets.estimate.status, "ready"); assert.equal(saved.nutritionTargets.estimate.calories, 2850);
      assert.equal(saved.nutritionTargets.estimate.proteinGrams, 112);
      assert.equal(saved.profile.userId, undefined); assert.equal(saved.profile.deletedAt, undefined);
      const retry = await submit(a.jwt, input, key); assert.equal(retry.status, 200); assert.deepEqual(await retry.json(), saved);
      for (const table of ["profiles", "training_preferences", "nutrition_estimates", "operation_receipts"]) assert.equal(await count(table, a.id), 1);
      assert.equal(await count("sync_changes", a.id), 2);
      const delta = await pullChanges(a.id, cursor, 100); assert.equal(delta.changes.length, 2);
      assert.deepEqual(delta.changes.map(c => c.entityType), ["profile", "training_preferences"]);
      assert.equal((delta.changes[0].payload as Record<string, unknown>).setupCompleted, true);
      const changed = await submit(a.jwt, { ...input, profile: { ...input.profile, ageYears: 26 } }, key);
      assert.equal(changed.status, 409); assert.equal((await changed.json()).error.code, "IDEMPOTENCY_KEY_REUSE");
      const again = await submit(a.jwt); assert.equal(again.status, 409); assert.equal((await again.json()).error.code, "ONBOARDING_ALREADY_COMPLETED");
      const meBody = await (await me.GET(request("me", a.jwt))).json(); assert.equal(meBody.setupCompleted, true);
      const stale = await legacyPush(a.id, { ageYears: 26 }); assert.equal(stale.results[0].status, "conflict");
      assert.equal((await (await me.GET(request("me", b.jwt))).json()).profile, null);
      const other = await submit(b.jwt, payload(), key); assert.equal(other.status, 200, "Idempotency keys are scoped to each account");
      const noMeasurements = await other.json(); assert.equal(noMeasurements.setupCompleted, true);
      assert.notEqual(noMeasurements.nutritionTargets.estimate.status, "ready");
      assert.equal(noMeasurements.nutritionTargets.estimate.calories, null);
    });

    await t.test("Stale versions reject; accepted final setup preserves omitted optional data and merges context", async () => {
      const c = await account();
      await legacyPush(c.id, { ageYears: 40, weightKg: 80, heightCm: 180, formulaSex: "female", gender: "non_binary",
        trainingLevel: "intermediate", trainingContext: { painAreas: ["knee"], recoveryStatus: "tired" },
        excludedExerciseIds: ["squat"], exerciseCapabilities: [{ mode: "gym", exerciseId: "press", maxReps: 8, weightKg: 4 }] });
      const stale = await submit(c.jwt); assert.equal(stale.status, 409); assert.equal((await stale.json()).error.code, "VERSION_CONFLICT");
      const final = { ...payload(), baseVersions: { profile: "1", trainingPreferences: "0" }, profile: {
        ...payload().profile, goal: "maintain", trainingContext: { recoveryStatus: "recovered" },
      } };
      const response = await submit(c.jwt, final); assert.equal(response.status, 200); const body = await response.json();
      assert.equal(body.profile.goal, "maintenance"); assert.equal(body.profile.weightKg, 80); assert.equal(body.profile.gender, "non_binary");
      assert.equal(body.profile.formulaSex, "female"); assert.equal(body.profile.heightCm, 180); assert.equal(body.profile.trainingLevel, "intermediate");
      assert.deepEqual(body.profile.trainingContext, { painAreas: ["knee"], recoveryStatus: "recovered" });
      assert.deepEqual(body.profile.excludedExerciseIds, ["squat"]); assert.equal(body.profile.exerciseCapabilities[0].maxReps, 8);
      assert.equal(body.nutritionTargets.estimate.normalizedGoal, "maintenance");
    });

    await t.test("Explicit optional null clears a measurement; legacy completed accounts remain completed", async () => {
      const c = await account(); await legacyPush(c.id, { weightKg: 80, gender: "male", setupCompleted: false });
      const response = await submit(c.jwt, { ...payload(), baseVersions: { profile: "1", trainingPreferences: "0" }, profile: { ...payload().profile, weightKg: null } });
      assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.profile.weightKg, null); assert.equal(body.profile.gender, "male");
      const legacy = await account(); await legacyPush(legacy.id, { setupCompleted: true });
      assert.equal((await (await me.GET(request("me", legacy.jwt))).json()).setupCompleted, true);
      assert.equal((await submit(legacy.jwt)).status, 409);
    });

    await t.test("Validation and equipment-mode errors leave all setup data untouched", async () => {
      const c = await account(); const base = payload();
      const invalids = [
        { ...base, userId: a.id },
        { ...base, profile: { ...base.profile, setupCompleted: true } },
        { ...base, profile: { ...base.profile, focus: null } },
        { ...base, baseVersions: { profile: "wat", trainingPreferences: "0" } },
        { ...base, trainingPreferences: { mode: "gym", equipment: ["missing_equipment"], noEquipment: false } },
        { ...base, trainingPreferences: { mode: "calisthenics", equipment: ["dumbbell"], noEquipment: false } },
        { ...base, trainingPreferences: { mode: "gym", equipment: ["dumbbell", "dumbbell"], noEquipment: false } },
        { ...base, trainingPreferences: { mode: "gym", equipment: [], noEquipment: false } },
        { ...base, trainingPreferences: { mode: "gym", equipment: ["dumbbell"], noEquipment: true } },
      ];
      for (const input of invalids) assert.equal((await submit(c.jwt, input)).status, 400);
      assert.equal((await complete.POST(request("onboarding/complete", c.jwt, base))).status, 400);
      assert.equal((await complete.POST(request("onboarding/complete?userId=other", c.jwt, base, randomUUID()))).status, 400);
      await db.update(schema.equipmentCatalog).set({ active: false }).where(eq(schema.equipmentCatalog.id, "dumbbell"));
      assert.equal((await submit(c.jwt)).status, 400);
      await db.update(schema.equipmentCatalog).set({ active: true }).where(eq(schema.equipmentCatalog.id, "dumbbell"));
      for (const table of ["profiles", "training_preferences", "nutrition_estimates", "operation_receipts", "sync_changes"]) assert.equal(await count(table, c.id), 0);
      const noEquipment = { ...base, profile: { ...base.profile, programSource: "custom", focus: null }, trainingPreferences: { mode: "calisthenics", equipment: [], noEquipment: true } };
      assert.equal((await submit(c.jwt, noEquipment)).status, 200);
    });

    await t.test("A failure in the second write rolls back profile, nutrition, sequence and receipt; retry succeeds", async () => {
      const c = await account(), key = randomUUID();
      const [before] = await db.select().from(schema.syncState).where(eq(schema.syncState.userId, c.id));
      await local.exec(`CREATE FUNCTION onboarding_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER onboarding_fail BEFORE INSERT ON training_preferences FOR EACH ROW EXECUTE FUNCTION onboarding_test_failure();`);
      const previousError = console.error; console.error = () => {};
      try { assert.equal((await submit(c.jwt, payload(), key)).status, 500); }
      finally { console.error = previousError; await local.exec("DROP TRIGGER onboarding_fail ON training_preferences; DROP FUNCTION onboarding_test_failure();"); }
      for (const table of ["profiles", "training_preferences", "nutrition_estimates", "operation_receipts", "sync_changes"]) assert.equal(await count(table, c.id), 0);
      const [after] = await db.select().from(schema.syncState).where(eq(schema.syncState.userId, c.id)); assert.equal(after.nextSequence, before.nextSequence);
      assert.equal((await submit(c.jwt, payload(), key)).status, 200);
    });

    await t.test("A legacy sync receipt cannot be reused as an onboarding key", async () => {
      const c = await account(), key = randomUUID();
      await pushOperations(c.id, syncPushSchema.parse({ schemaVersion: 1, deviceId: "synthetic", operations: [{ operationId: key, entityType: "profile", entityId: "profile", action: "upsert", baseVersion: "0", payload: { ageYears: 25 } }] }));
      const response = await submit(c.jwt, { ...payload(), baseVersions: { profile: "1", trainingPreferences: "0" } }, key);
      assert.equal(response.status, 409); assert.equal((await response.json()).error.code, "IDEMPOTENCY_KEY_REUSE");
    });

    await t.test("Tombstone versions are retained without reviving deleted data; pull uses stored numeric precision", async () => {
      const c = await account();
      await legacyPush(c.id, { gender: "female", trainingContext: { painAreas: ["knee"] }, trainingLevel: "advanced" });
      await pushOperations(c.id, syncPushSchema.parse({ schemaVersion: 1, deviceId: "synthetic", operations: [{ operationId: randomUUID(), entityType: "profile", entityId: "profile", action: "delete", baseVersion: "1" }] }));
      const before = await (await me.GET(request("me", c.jwt))).json();
      assert.equal(before.setupCompleted, false); assert.equal(before.profile, null); assert.equal(before.versions.profile, "2");
      const cursor = (await bootstrap(c.id)).cursor;
      const response = await submit(c.jwt, { ...payload(), baseVersions: before.versions, profile: { ...payload().profile, weightKg: 70.123 } });
      assert.equal(response.status, 200); const body = await response.json();
      assert.equal(body.profile.version, "3"); assert.equal(body.profile.gender, null); assert.equal(body.profile.trainingContext, null);
      assert.equal(body.profile.trainingLevel, null); assert.equal(body.profile.weightKg, 70.12);
      const { version, updatedAt, ...fields } = body.profile; assert.ok(version); assert.ok(updatedAt);
      const delta = await pullChanges(c.id, cursor, 100); assert.deepEqual(delta.changes[0].payload, fields);
    });

    await t.test("Restricted runtime role can complete onboarding; inactive accounts cannot submit or replay", async () => {
      const c = await account(), key = randomUUID();
      await local.exec("CREATE ROLE musmove_runtime NOLOGIN;"); await local.exec(await readFile("scripts/runtime-role-grants.sql", "utf8"));
      await local.exec("SET ROLE musmove_runtime;");
      try { assert.equal((await submit(c.jwt, payload(), key)).status, 200); assert.equal((await me.GET(request("me", c.jwt))).status, 200); }
      finally { await local.exec("RESET ROLE;"); }
      await db.update(schema.users).set({ status: "deletion_requested" }).where(eq(schema.users.id, c.id));
      assert.equal((await submit(c.jwt, payload(), key)).status, 403); assert.equal((await me.GET(request("me", c.jwt))).status, 403);
    });
  } finally {
    globalDb.musmoveDatabase = previousDb; globalDb.musmovePool = previousPool; globalThis.fetch = previousFetch;
    if (previousAuth === undefined) delete process.env.NEON_AUTH_BASE_URL; else process.env.NEON_AUTH_BASE_URL = previousAuth;
    await local.close(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
