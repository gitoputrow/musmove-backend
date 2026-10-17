import assert from "node:assert/strict";
import { randomBytes, randomUUID, webcrypto } from "node:crypto";
import { createServer } from "node:http";
import { loadEnvConfig } from "@next/env";
import { and, eq } from "drizzle-orm";
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";

loadEnvConfig(process.cwd());
Object.assign(process.env, { NODE_ENV: "test" });
process.env.SYNC_CURSOR_SECRET = randomBytes(32).toString("hex");
if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto });

async function main() {
  const { getDatabase, getPool } = await import("../../src/db/client");
  const { users, mealEntries } = await import("../../src/db/schema");
  const { RATE_LIMIT_SQL } = await import("../../src/lib/security/rate-limit");
  const me = await import("../../app/api/v1/me/route");
  const push = await import("../../app/api/v1/sync/push/route");
  const pull = await import("../../app/api/v1/sync/pull/route");
  const bootstrap = await import("../../app/api/v1/sync/bootstrap/route");
  const meals = await import("../../app/api/v1/meals/route");
  const deletion = await import("../../app/api/v1/account/deletion-requests/route");
  const db = getDatabase();
  const { privateKey, publicKey } = await generateKeyPair("EdDSA");
  const jwk = { ...await exportJWK(publicKey), kid: "audit-key", alg: "EdDSA", use: "sig" };
  const server = createServer((request, response) => {
    if (request.url !== "/auth/.well-known/jwks.json") { response.writeHead(404).end(); return; }
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const issuer = `http://127.0.0.1:${address.port}`;
  process.env.NEON_AUTH_BASE_URL = `${issuer}/auth`;
  const subjectA = randomUUID(), subjectB = randomUUID(), subjectLarge = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const claims: JWTPayload = { role: "authenticated", banned: false, iss: issuer, aud: issuer,
    iat: now, exp: now + 900, sub: subjectA };
  const sign = (override: JWTPayload = {}) => new SignJWT({ ...claims, ...override }).setProtectedHeader({ alg: "EdDSA", kid: "audit-key" }).sign(privateKey);
  const get = (path: string, token?: string) => new Request(`http://localhost/api/v1/${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  const post = (path: string, token: string, value?: unknown, origin?: string) => new Request(`http://localhost/api/v1/${path}`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(origin ? { origin } : {}) },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
  const quotaKey = randomBytes(32).toString("hex");
  try {
    assert.equal((await me.GET(get("me"))).status, 401);
    assert.equal((await me.GET(new Request("http://localhost/api/v1/me", { headers: { cookie: "session=fake" } }))).status, 401);
    const jwtA = await sign(), jwtB = await sign({ sub: subjectB });
    for (const override of [
      { iss: "https://attacker.test" }, { aud: "other-app" }, { role: "anonymous" }, { banned: true }, { banned: "false" },
      { banned: undefined }, { exp: undefined }, { iat: undefined }, { exp: now - 60 }, { iat: now + 120 },
      { iat: now - 3600, exp: now + 60 }, { exp: now + 3600 }, { sub: " " }, { sub: "x".repeat(256) },
      { sub: 123 as unknown as string },
    ] as JWTPayload[]) {
      assert.equal((await me.GET(get("me", await sign(override)))).status, 401, `Invalid claims rejected: ${Object.keys(override)}`);
    }
    const [head, payload] = jwtA.split(".");
    const forged = `${head}.${payload}.${Buffer.alloc(64).toString("base64url")}`;
    assert.equal((await me.GET(get("me", forged))).status, 401);
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${payload}.`;
    assert.equal((await me.GET(get("me", none))).status, 401);
    const hs = await new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).sign(randomBytes(32));
    assert.equal((await me.GET(get("me", hs))).status, 401);
    assert.equal((await me.GET(get("me", "x".repeat(8193)))).status, 401);

    const identities = await Promise.all(Array.from({ length: 3 }, async () => {
      const response = await me.GET(get("me", jwtA)); assert.equal(response.status, 200); return (await response.json()).user.id as string;
    }));
    assert.equal(new Set(identities).size, 1);
    const idA = identities[0];
    const responseB = await me.GET(get("me", jwtB)); assert.equal(responseB.status, 200);
    const idB = (await responseB.json()).user.id as string;
    assert.notEqual(idA, idB);
    const mapped = await db.select().from(users).where(eq(users.issuer, issuer));
    assert.equal(mapped.length, 2, "Rejected JWTs must never provision users");
    const timestamp = mapped.find((user) => user.id === idA)!.updatedAt.toISOString();
    await me.GET(get("me", jwtA));
    assert.equal((await db.select().from(users).where(eq(users.id, idA)))[0].updatedAt.toISOString(), timestamp);

    const meal = { menuName: "Private account A meal", note: "private-account-a-note", samplePriceRupiah: null, snapshot: {},
      catalogId: null, servings: 1, consumedAt: "2026-10-17T12:00:00+07:00", recordedOn: "2026-10-17", mealType: "lunch",
      nutrition: { caloriesKcal: 300, proteinGrams: 20 } };
    const op = { action: "upsert", baseVersion: "0", entityId: "private-meal", entityType: "meal_entry", operationId: randomUUID(), payload: meal };
    const input = { schemaVersion: 1, deviceId: "security-test", operations: [op] };
    const saved = await push.POST(post("sync/push", jwtA, input)); assert.equal(saved.status, 200);
    assert.equal((await saved.json()).results[0].status, "applied");
    const dayA = await meals.GET(get("meals?date=2026-10-17", jwtA));
    assert.match(dayA.headers.get("cache-control")!, /no-store/);
    assert.equal((await dayA.json()).entries[0].note, meal.note);
    const dayB = await meals.GET(get("meals?date=2026-10-17", jwtB));
    assert.equal((await dayB.json()).entries.length, 0);
    assert.equal((await meals.GET(get(`meals?date=2026-10-17&userId=${idA}`, jwtB))).status, 400);
    const stateA = await bootstrap.GET(get("sync/bootstrap", jwtA));
    const cursorA = (await stateA.json()).cursor;
    assert.equal((await pull.GET(get(`sync/pull?cursor=${encodeURIComponent(cursorA)}`, jwtB))).status, 400);
    const stateB = await bootstrap.GET(get("sync/bootstrap", jwtB));
    assert.equal((await stateB.json()).entities.meal_entry.length, 0);
    const attack = await push.POST(post("sync/push", jwtB, { ...input, operations: [{ ...op, baseVersion: "1", operationId: randomUUID() }] }));
    const conflict = (await attack.json()).results[0];
    assert.equal(conflict.status, "conflict");
    assert.equal(conflict.conflict.currentPayload, null);
    const remove = await push.POST(post("sync/push", jwtB, { ...input, operations: [{ action: "delete", entityType: "meal_entry", entityId: op.entityId, operationId: randomUUID(), baseVersion: "0" }] }));
    assert.equal((await remove.json()).results[0].error.code, "ENTITY_NOT_FOUND");
    assert.equal((await db.select().from(mealEntries).where(and(eq(mealEntries.userId, idA), eq(mealEntries.id, op.entityId))))[0].note, meal.note);
    assert.equal((await push.POST(post("sync/push", jwtA, { ...input, userId: idB }))).status, 400);
    assert.equal((await push.POST(post("sync/push", jwtA, input, "https://attacker.test"))).status, 403);

    const jwtLarge = await sign({ sub: subjectLarge });
    const largeUser = (await (await me.GET(get("me", jwtLarge))).json()).user.id as string;
    await db.insert(mealEntries).values(Array.from({ length: 501 }, (_, index) => ({ userId: largeUser, id: `security-size-${index}`, snapshot: {} })));
    const largeResponse = await bootstrap.GET(get("sync/bootstrap", jwtLarge));
    assert.equal(largeResponse.status, 413);
    assert.equal((await largeResponse.json()).error.code, "BOOTSTRAP_LIMIT");

    const quota = await Promise.all(Array.from({ length: 12 }, () => getPool().query(RATE_LIMIT_SQL, [quotaKey, 60000, 5])));
    assert.equal(quota.filter((result) => result.rowCount === 1).length, 5, "One quota is shared across pooled database connections");
    assert.equal((await deletion.POST(post("account/deletion-requests", jwtB))).status, 202);
    assert.equal((await me.GET(get("me", jwtB))).status, 403, "Existing signed JWT cannot access an inactive local account");
    console.info("Security integration passed: real signed JWT/JWKS, invalid-token rejection, concurrent identity mapping, cross-user isolation, CSRF, payload limits, shared quota and inactive accounts");
  } finally {
    await getPool().query("DELETE FROM api_rate_limits WHERE bucket_key=$1", [quotaKey]);
    await db.delete(users).where(eq(users.issuer, issuer));
    await getPool().end();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}
void main().catch(() => { console.error("Security integration failed (details intentionally suppressed to avoid logging JWTs or private test data)"); process.exitCode = 1; });
