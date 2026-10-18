import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import type { Database } from "../../src/db/client";
import * as schema from "../../src/db/schema";
import { ApiError } from "../../src/lib/api-error";
import { syncPushSchema } from "../../src/modules/sync/dto";
import { bootstrap, pullChanges, pushOperations } from "../../src/modules/sync/service";
import { startSnapshot, snapshotPage, snapshotPageSchema, releaseSnapshot } from "../../src/modules/sync/snapshots";
import { decodeCursor } from "../../src/modules/sync/encoding";
import { processOneDeletion, requestAccountDeletion, readDeletionStatus } from "../../src/modules/accounts/deletion";
import { deletePost, feedQuerySchema, publishPost, readFeed, reportPost, moderateReport } from "../../src/modules/social/service";
import { completePasswordReset, resetPasswordSchema } from "../../src/modules/accounts/password-reset";
import { NeonDeletionProvider } from "../../src/modules/accounts/neon-deletion";
import { readFile } from "node:fs/promises";

const status = (code: string) => (error: unknown) => error instanceof ApiError && error.code === code;

test("Mobile follow-up integration is isolated from Neon/production", async t => {
  Object.assign(process.env, { NODE_ENV: "test", SYNC_CURSOR_SECRET: randomBytes(32).toString("hex"), SOCIAL_PUBLISHING_ENABLED: "true" });
  delete process.env.VERCEL;
  const local = new PGlite();
  const db = drizzle(local, { schema });
  const globalDb = globalThis as unknown as { musmoveDatabase?: Database; musmovePool?: unknown };
  const previous = globalDb.musmoveDatabase;
  const previousPool = globalDb.musmovePool;
  const originalFetch = globalThis.fetch;
  globalDb.musmovePool = { query() { throw new Error("Live PostgreSQL pool forbidden in isolated tests"); }, end: async () => {} };
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("External network forbidden in isolated tests");
    return originalFetch(input, init);
  };
  const pair = await generateKeyPair("EdDSA");
  const jwk = { ...await exportJWK(pair.publicKey), kid: "local-follow-up", alg: "EdDSA", use: "sig" };
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
    const subjectA = randomUUID(), subjectB = randomUUID();
    const token = (sub: string) => new SignJWT({ role: "authenticated", banned: false }).setProtectedHeader({ alg: "EdDSA", kid: "local-follow-up" }).setIssuer(issuer).setAudience(issuer).setSubject(sub).setIssuedAt().setExpirationTime("15m").sign(pair.privateKey);
    const jwtA = await token(subjectA), jwtB = await token(subjectB);
    const me = await import("../../app/api/v1/me/route");
    const pushRoute = await import("../../app/api/v1/sync/push/route");
    const deletionRoute = await import("../../app/api/v1/account/deletion-requests/route");
    const req = (path: string, jwt: string, body?: unknown) => new Request(`https://api.example.test/api/v1/${path}`, { method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const aResponse = await me.GET(req("me", jwtA)); assert.equal(aResponse.status, 200);
    const a = (await aResponse.json()).user.id as string;
    const bResponse = await me.GET(req("me", jwtB)); assert.equal(bResponse.status, 200);
    const b = (await bResponse.json()).user.id as string;
    const operation = (entityType: string, entityId: string, payload: unknown, baseVersion = "0") => ({ operationId: randomUUID(), entityType, entityId, action: "upsert", baseVersion, payload });
    const push = (userId: string, operations: unknown[]) => pushOperations(userId, syncPushSchema.parse({ schemaVersion: 1, deviceId: "local-synthetic", operations }));

    await t.test("Two signed clients: retry receipt, conflict, account isolation and tombstone", async () => {
      const op = operation("profile", "profile", { displayName: "Synthetic A", ageYears: 25 });
      const envelope = { schemaVersion: 1, deviceId: "synthetic-device-a", operations: [op] };
      const first = await pushRoute.POST(req("sync/push", jwtA, envelope)); assert.equal(first.status, 200);
      assert.equal((await first.json()).results[0].status, "applied");
      const retry = await pushRoute.POST(req("sync/push", jwtA, envelope)); assert.equal((await retry.json()).results[0].status, "duplicate");
      const conflict = await push(a, [operation("profile", "profile", { displayName: "Stale device" })]); assert.equal(conflict.results[0].status, "conflict");
      const other = await bootstrap(b); assert.equal(other.entities.profile.length, 0);
      const cursor = (await bootstrap(a)).cursor;
      await assert.rejects(pullChanges(b, cursor, 100), status("INVALID_CURSOR"));
      assert.equal((await push(a, [operation("social_draft", "deleted-draft", { body: "private", metadata: null })])).results[0].status, "applied");
      assert.equal((await push(a, [{ operationId: randomUUID(), entityType: "social_draft", entityId: "deleted-draft", action: "delete", baseVersion: "1" }])).results[0].status, "applied");
      const pulled = await pullChanges(a, cursor, 100); assert.ok(pulled.changes.some(c => c.operation === "delete"));
    });

    await t.test("Large immutable snapshot, resumable pages, concurrent changes and final stream handoff", async () => {
      await local.query(`INSERT INTO meal_entries(user_id,id,snapshot) SELECT $1,'meal-'||lpad(n::text,4,'0'),jsonb_build_object('filler',repeat('x',3000)) FROM generate_series(1,650) n`, [a]);
      await assert.rejects(bootstrap(a), status("BOOTSTRAP_LIMIT"));
      const id = randomUUID(); const started = await startSnapshot(a, id);
      assert.equal(started.total, 651); assert.deepEqual(await startSnapshot(a, id), started);
      const query = (cursor?: string) => snapshotPageSchema.parse({ snapshotId: id, limit: "50", ...(cursor ? { cursor } : {}) });
      const first = await snapshotPage(a, query()); assert.equal(first.complete, false); assert.equal(first.syncCursor, null);
      assert.deepEqual(await snapshotPage(a, query()), first, "Interrupted first page can be replayed exactly");
      await assert.rejects(snapshotPage(b, query()), status("SNAPSHOT_EXPIRED"));
      await assert.rejects(snapshotPage(b, query(first.nextPageCursor!)), status("INVALID_CURSOR"));
      const legacyMeal = { menuName: "Changed after snapshot", note: null, samplePriceRupiah: null, snapshot: {} };
      const changes = await push(a, [operation("meal_entry", "meal-0640", legacyMeal, "1"),
        { operationId: randomUUID(), entityType: "meal_entry", entityId: "meal-0649", action: "delete", baseVersion: "1" },
        operation("meal_entry", "after-snapshot", legacyMeal)]);
      assert.ok(changes.results.every(r => r.status === "applied"));
      const items = [...first.items]; let page = first;
      while (!page.complete) { page = await snapshotPage(a, query(page.nextPageCursor!)); items.push(...page.items); }
      assert.equal(items.length, 651); assert.equal(new Set(items.map(i => `${i.entityType}:${i.entityId}`)).size, 651);
      assert.equal((items.find(i => i.entityId === "meal-0640")!.payload as Record<string, unknown>).menuName, null);
      assert.ok(items.some(i => i.entityId === "meal-0649")); assert.ok(!items.some(i => i.entityId === "after-snapshot"));
      assert.ok(page.syncCursor); assert.equal(decodeCursor(page.syncCursor!, a).sequence, "3");
      const delta = await pullChanges(a, page.syncCursor!, 100); assert.equal(delta.changes.length, 3);
      assert.ok(delta.changes.some(c => c.entityId === "meal-0649" && c.operation === "delete"));
      await releaseSnapshot(a, id); assert.equal((await local.query("SELECT 1 FROM sync_snapshot_items WHERE snapshot_id=$1", [id])).rows.length, 0);
    });

    await t.test("Snapshot byte budget, active quota, expiry and epoch recovery", async () => {
      await local.query(`INSERT INTO meal_entries(user_id,id,snapshot) SELECT $1,'wide-'||n,jsonb_build_object('filler',repeat('x',40000)) FROM generate_series(1,60) n`, [b]);
      const one = randomUUID(), two = randomUUID(); await startSnapshot(b, one); await startSnapshot(b, two);
      await assert.rejects(startSnapshot(b, randomUUID()), status("SNAPSHOT_BUSY"));
      const first = await snapshotPage(b, snapshotPageSchema.parse({ snapshotId: one, limit: 100 }));
      assert.ok(first.items.length < 60); assert.equal(first.complete, false);
      assert.ok(Buffer.byteLength(JSON.stringify(first)) < 3 * 1024 * 1024);
      await local.query("UPDATE sync_snapshots SET expires_at=now()-interval '1 minute' WHERE id=$1", [one]);
      await assert.rejects(snapshotPage(b, snapshotPageSchema.parse({ snapshotId: one })), status("SNAPSHOT_EXPIRED"));
      await assert.rejects(startSnapshot(b, one), status("SNAPSHOT_EXPIRED"));
      await local.query("UPDATE sync_state SET epoch=$1 WHERE user_id=$2", [randomUUID(), b]);
      await assert.rejects(snapshotPage(b, snapshotPageSchema.parse({ snapshotId: two })), status("SNAPSHOT_EXPIRED"));
      await releaseSnapshot(b, one); await releaseSnapshot(b, two);
    });

    await t.test("Onboarding ACK creates canonical nutrition and personalized programs without trusting client meal nutrition", async () => {
      const profile = { displayName: "Synthetic A", ageYears: 25, weightKg: 70, heightCm: 175, formulaSex: "male", gender: "prefer_not_to_say", dailyActivity: "light", goal: "bulk", focus: "full", trainingLevel: "beginner", sessionMinutes: 60, trainingFrequency: 3, setupCompleted: true, trainingContext: { healthStatus: "no_known_restrictions", recoveryStatus: "recovered" } };
      const saved = await push(a, [operation("profile", "profile", profile, "1"), operation("training_preferences", "training_preferences", { mode: "gym", equipment: ["dumbbell", "bench"], noEquipment: false })]);
      assert.ok(saved.results.every(r => r.status === "applied"));
      const { getNutritionTargets } = await import("../../src/modules/nutrition/storage");
      const targets = await getNutritionTargets(a); assert.equal(targets.estimate?.status, "ready"); assert.equal(targets.estimate?.calories, 2850); assert.equal(targets.estimate?.proteinGrams, 112);
      const { getProgramCatalog } = await import("../../src/modules/programs/service");
      assert.ok((await getProgramCatalog(a)).programs.length > 0);
      const meal = { menuName: "forged", note: null, samplePriceRupiah: null, snapshot: {}, catalogId: "tkpi-ap001", servings: 1.5, consumedAt: "2026-10-18T07:00:00+07:00", recordedOn: "2026-10-18", mealType: "breakfast", nutrition: { caloriesKcal: 1, proteinGrams: 1 } };
      assert.equal((await push(a, [operation("meal_entry", "reference-food", meal)])).results[0].status, "applied");
      const [stored] = await db.select().from(schema.mealEntries).where(eq(schema.mealEntries.id, "reference-food"));
      assert.equal(stored.caloriesKcal, 270); assert.equal(stored.proteinGrams, 4.5); assert.notEqual(stored.menuName, "forged");
    });

    await t.test("Explicit text publishing, drafts never leak, owner deletes and private reports/moderation", async () => {
      await push(a, [operation("social_draft", "private-social", { body: "NEVER_IN_PUBLIC_FEED", metadata: null })]);
      const post = { postId: randomUUID(), publish: true as const, authorLabel: "Chosen public alias", body: "A public text post" };
      assert.equal((await publishPost(a, post)).duplicate, false); assert.equal((await publishPost(a, post)).duplicate, true);
      await assert.rejects(publishPost(a, { ...post, body: "different" }), status("POST_ID_REUSE"));
      const feed = await readFeed(b, feedQuerySchema.parse({})); assert.equal(feed.items.length, 1);
      assert.ok(!JSON.stringify(feed).includes("NEVER_IN_PUBLIC_FEED")); assert.ok(!JSON.stringify(feed).includes("userId"));
      await assert.rejects(deletePost(b, post.postId), status("POST_NOT_FOUND"));
      await assert.rejects(reportPost(a, { postId: post.postId, reason: "spam", details: null }), status("OWN_POST_REPORT"));
      assert.equal((await reportPost(b, { postId: post.postId, reason: "spam", details: "Private report" })).duplicate, false);
      assert.equal((await reportPost(b, { postId: post.postId, reason: "spam", details: null })).duplicate, true);
      const [report] = await db.select().from(schema.socialReports); await moderateReport(report.id, "hide", "synthetic-moderator");
      assert.equal((await readFeed(a, feedQuerySchema.parse({}))).items.length, 0);
      await deletePost(a, post.postId); await deletePost(a, post.postId);
      assert.equal((await db.select().from(schema.socialPosts).where(eq(schema.socialPosts.id, post.postId)))[0].body, "[deleted]");
      await assert.rejects(publishPost(a, post), status("POST_DELETED"));
    });

    await t.test("Feed cursor is signed/account-bound and retains order with same timestamp", async () => {
      for (let i = 0; i < 3; i++) await publishPost(b, { postId: randomUUID(), publish: true, authorLabel: "B", body: `Post ${i}` });
      await local.query("UPDATE social_posts SET created_at='2026-10-18T10:00:00.123456Z' WHERE user_id=$1", [b]);
      const first = await readFeed(a, feedQuerySchema.parse({ limit: 1 })); assert.ok(first.nextCursor);
      await assert.rejects(readFeed(b, feedQuerySchema.parse({ cursor: first.nextCursor })), status("INVALID_CURSOR"));
      const second = await readFeed(a, feedQuerySchema.parse({ cursor: first.nextCursor, limit: 2 }));
      assert.equal(second.items.length, 2); assert.ok(second.items.every(i => i.postId !== first.items[0].postId));
    });

    await t.test("New routes enforce authentication, explicit publishing, feature flag and shared policy limits", async () => {
      const route = await import("../../app/api/v1/social/posts/route");
      process.env.SOCIAL_PUBLISHING_ENABLED = "false";
      assert.equal((await route.GET(req("social/posts", jwtB))).status, 403);
      process.env.SOCIAL_PUBLISHING_ENABLED = "true";
      assert.equal((await route.GET(new Request("https://api.example.test/api/v1/social/posts"))).status, 401);
      const publication = { postId: randomUUID(), publish: true, authorLabel: "B", body: "Route publication" };
      for (let i = 0; i < 3; i++) assert.equal((await route.POST(req("social/posts", jwtB, publication))).status, 201);
      const limited = await route.POST(req("social/posts", jwtB, publication)); assert.equal(limited.status, 429); assert.equal(limited.headers.get("retry-after"), "600");
    });

    await t.test("Runtime grants permit snapshot/identity flows but cannot write revocation guards or resolve moderation", async () => {
      await local.exec("CREATE ROLE musmove_runtime NOLOGIN;");
      await local.exec(await readFile("scripts/runtime-role-grants.sql", "utf8"));
      await local.exec("SET ROLE musmove_runtime;");
      try {
        const id = randomUUID(); await startSnapshot(b, id); await releaseSnapshot(b, id);
        assert.equal((await me.GET(req("me", jwtB))).status, 200);
        await assert.rejects(local.query("INSERT INTO revoked_identities VALUES ($1,now()+interval '1 minute')", [randomBytes(32).toString("hex")]));
        await assert.rejects(local.exec("UPDATE social_reports SET status='resolved' WHERE false"));
      } finally { await local.exec("RESET ROLE;"); }
    });

    await t.test("7-day deletion is idempotent, provider failure retains data, purge blocks old JWT reprovision", async () => {
      const first = await deletionRoute.POST(new Request("https://api.example.test/api/v1/account/deletion-requests", { method: "POST", headers: { authorization: `Bearer ${jwtA}` } })); assert.equal(first.status, 202);
      const firstBody = await first.json(); assert.ok(Date.parse(firstBody.deleteAfter) - Date.now() > 6.99 * 86400000);
      const again = await requestAccountDeletion(a); assert.equal(again.deletionRequestId, firstBody.deletionRequestId); assert.equal(again.deleteAfter, firstBody.deleteAfter);
      assert.equal((await me.GET(req("me", jwtA))).status, 403);
      assert.equal((await deletionRoute.GET(req("account/deletion-requests", jwtA))).status, 200);
      assert.equal((await readDeletionStatus(a)).status, "deletion_requested");
      assert.equal((await push(a, [operation("profile", "profile", { displayName: "not allowed" }, "1")])).results[0].status, "rejected");
      let calls = 0; const provider = { remove: async () => { calls++; } };
      assert.deepEqual(await processOneDeletion(provider), { processed: false }); assert.equal(calls, 0);
      await local.query("UPDATE account_deletion_jobs SET delete_after=now()-interval '1 minute' WHERE user_id=$1", [a]);
      assert.equal((await processOneDeletion({ remove: async () => { throw new Error("synthetic failure"); } })).status, "failed");
      assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, a))).length, 1);
      await local.query("UPDATE account_deletion_jobs SET retry_at=now()-interval '1 minute' WHERE user_id=$1", [a]);
      assert.equal((await processOneDeletion(provider)).status, "completed"); assert.equal(calls, 1);
      assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, a))).length, 0);
      assert.equal((await local.query("SELECT 1 FROM meal_entries WHERE user_id=$1", [a])).rows.length, 0);
      await local.exec("SET ROLE musmove_runtime;");
      try { await assert.rejects(local.query("INSERT INTO users(issuer,subject) VALUES ($1,$2)", [issuer, subjectA])); }
      finally { await local.exec("RESET ROLE;"); }
      assert.equal((await me.GET(req("me", jwtA))).status, 401);
      assert.equal((await local.query("SELECT 1 FROM users WHERE issuer=$1 AND subject=$2", [issuer, subjectA])).rows.length, 0);
      assert.equal((await me.GET(req("me", jwtB))).status, 200, "Other account remains active");
    });

    await t.test("Provider acknowledgment survives failed local purge and retry does not repeat provider deletion", async () => {
      const [c] = await db.insert(schema.users).values({ issuer, subject: randomUUID() }).returning();
      await db.insert(schema.syncState).values({ userId: c.id }); await requestAccountDeletion(c.id);
      await local.query("UPDATE account_deletion_jobs SET delete_after=now()-interval '1 minute' WHERE user_id=$1", [c.id]);
      await local.exec(`CREATE FUNCTION followup_test_purge_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.id='${c.id}'::uuid THEN RAISE EXCEPTION 'synthetic purge failure'; END IF; RETURN OLD; END $$; CREATE TRIGGER followup_fail_delete BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION followup_test_purge_failure();`);
      let calls = 0; const provider = { remove: async () => { calls++; } };
      try {
        assert.equal((await processOneDeletion(provider)).status, "failed");
        const [job] = await db.select().from(schema.accountDeletionJobs).where(eq(schema.accountDeletionJobs.userId, c.id));
        assert.ok(job.providerDeletedAt); assert.equal(job.status, "failed"); assert.equal(calls, 1);
      } finally { await local.exec("DROP TRIGGER followup_fail_delete ON users; DROP FUNCTION followup_test_purge_failure();"); }
      await local.query("UPDATE account_deletion_jobs SET retry_at=now()-interval '1 minute' WHERE user_id=$1", [c.id]);
      assert.equal((await processOneDeletion(provider)).status, "completed"); assert.equal(calls, 1);
    });

    await t.test("Provider admin deletion and password reset never forward credentials or accept route 404 as success", async () => {
      const savedFetch = globalThis.fetch, savedAuth = process.env.NEON_AUTH_BASE_URL;
      process.env.NEON_AUTH_BASE_URL = "https://auth.example.test/neondb/auth";
      process.env.NEON_AUTH_ADMIN_COOKIE = "synthetic-session=not-a-real-secret";
      try {
        const paths: string[] = [];
        globalThis.fetch = async (url, init) => { paths.push(String(url)); assert.equal(init?.redirect, "error"); return Response.json({ success: true }); };
        await new NeonDeletionProvider().remove("https://auth.example.test", "synthetic-user"); assert.equal(paths.length, 2);
        globalThis.fetch = async () => Response.json({ code: "NOT_FOUND" }, { status: 404 });
        await assert.rejects(new NeonDeletionProvider().remove("https://auth.example.test", "synthetic-user"));
        globalThis.fetch = async (_url, init) => { assert.ok(!new Headers(init?.headers).has("cookie")); assert.ok(!new Headers(init?.headers).has("authorization")); return Response.json({ status: true }); };
        assert.deepEqual(await completePasswordReset(resetPasswordSchema.parse({ token: "synthetic-reset-capability", newPassword: "synthetic-password" })), { status: "password_changed" });
        globalThis.fetch = async () => Response.json({}, { status: 400 });
        await assert.rejects(completePasswordReset({ token: "expired-token", newPassword: "synthetic-password" }), status("RESET_REJECTED"));
        globalThis.fetch = async () => Response.json({ status: false });
        await assert.rejects(completePasswordReset({ token: "synthetic-token", newPassword: "synthetic-password" }), status("AUTH_UNAVAILABLE"));
        globalThis.fetch = async () => new Response("x".repeat(20000));
        await assert.rejects(new NeonDeletionProvider().remove("https://auth.example.test", "synthetic-user"));
      } finally { globalThis.fetch = savedFetch; process.env.NEON_AUTH_BASE_URL = savedAuth; delete process.env.NEON_AUTH_ADMIN_COOKIE; }
    });
  } finally {
    globalDb.musmoveDatabase = previous;
    globalDb.musmovePool = previousPool;
    globalThis.fetch = originalFetch;
    await local.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
