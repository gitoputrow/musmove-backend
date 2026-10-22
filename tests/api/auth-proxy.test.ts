import assert from "node:assert/strict";
import { hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { EncryptJWT, exportJWK, generateKeyPair, SignJWT } from "jose";
import type { Database } from "../../src/db/client";
import * as schema from "../../src/db/schema";
import * as signup from "../../app/api/v1/auth/sign-up/email/route";
import * as signin from "../../app/api/v1/auth/sign-in/email/route";
import * as session from "../../app/api/v1/auth/get-session/route";
import * as token from "../../app/api/v1/auth/token/route";
import * as signout from "../../app/api/v1/auth/sign-out/route";
import * as reset from "../../app/api/v1/auth/request-password-reset/route";
import * as me from "../../app/api/v1/me/route";

test("Native auth proxy is isolated from live Neon, email delivery, and production data", async t => {
  const savedEnv = { ...process.env }, savedFetch = globalThis.fetch;
  const savedWarn = console.warn;
  const warnings: { message: unknown; diagnostic: Record<string, unknown> }[] = [];
  console.warn = (message, diagnostic) => { warnings.push({ message, diagnostic }); };
  const globalDb = globalThis as unknown as { musmoveDatabase?: Database; musmovePool?: unknown };
  const previousDb = globalDb.musmoveDatabase, previousPool = globalDb.musmovePool;
  const local = new PGlite();
  const origin = "https://api.example.test", issuer = "https://identity.example.test", base = `${issuer}/neondb/auth`;
  const userId = randomUUID();
  const user = { id: userId, email: "synthetic@example.test", name: "Synthetic", emailVerified: true };
  const pair = await generateKeyPair("EdDSA");
  const jwk = { ...await exportJWK(pair.publicKey), kid: "synthetic-auth", alg: "EdDSA", use: "sig" };
  const accessToken = await new SignJWT({ role: "authenticated", banned: false }).setProtectedHeader({ alg: "EdDSA", kid: jwk.kid })
    .setSubject(userId).setIssuer(issuer).setAudience(issuer).setIssuedAt().setExpirationTime("15m").sign(pair.privateKey);
  const rawCookie = "synthetic-provider-session.signed", rotatedCookie = "synthetic-rotated-session.signed";
  let currentCookie = rawCookie, active = true, rotate = false, calls = 0, ip = 0;
  let currentCookieName = "__Secure-neon-auth.session_token";
  let override: ((path: string) => Response | undefined) | undefined;
  const captures: { path: string; headers: Headers; body: unknown }[] = [];
  const response = (value: unknown, status = 200, cookie?: string) => {
    const headers = new Headers({ "content-type": "application/json" });
    if (cookie) {
      headers.append("set-cookie", `${currentCookieName}=${cookie}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned`);
      headers.append("set-cookie", "__Secure-neon-auth.local.session_data=private-cache-data; Path=/; HttpOnly; Secure");
      headers.append("set-cookie", "admin_session=must-never-be-forwarded; Path=/; Secure");
    }
    return Response.json(value, { status, headers });
  };
  const request = (path: string, method = "GET", body?: unknown, authorization?: string, headers: Record<string, string> = {}) => new Request(`${origin}/api/v1/${path}`, {
    method, headers: { "x-vercel-forwarded-for": `198.51.100.${++ip % 250 + 1}`, ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(authorization ? { authorization } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const login = () => signin.POST(request("auth/sign-in/email", "POST", { email: user.email, password: "synthetic-password-only" }));
  const data = async (reply: Response, expected = 200) => {
    assert.equal(reply.status, expected);
    assert.match(reply.headers.get("cache-control")!, /no-store/);
    assert.equal(reply.headers.get("set-cookie"), null);
    assert.equal(reply.headers.get("location"), null);
    const body = await reply.json();
    assert.doesNotMatch(JSON.stringify(body), /synthetic-provider-session|synthetic-rotated-session|private-cache-data|must-never-be-forwarded|secret-provider-field|synthetic-password-only/);
    return body;
  };
  try {
    Object.assign(process.env, { NODE_ENV: "test", VERCEL: "1", AUTH_SECRET: randomBytes(32).toString("hex"),
      SYNC_CURSOR_SECRET: randomBytes(32).toString("hex"), API_RATE_LIMIT_SECRET: randomBytes(32).toString("hex"),
      NEON_AUTH_BASE_URL: base, AUTH_PUBLIC_ORIGIN: origin,
      DATABASE_URL: "postgresql://USER:PASSWORD@database.example.test/db?sslmode=verify-full" });
    delete process.env.NEON_AUTH_ADMIN_COOKIE;
    await migrate(drizzle(local), { migrationsFolder: "drizzle", migrationsSchema: "drizzle", migrationsTable: "migrations" });
    globalDb.musmoveDatabase = drizzle(local, { schema }) as unknown as Database;
    globalDb.musmovePool = { query: async (sql: string, values: unknown[]) => {
      const result = await local.query(sql, values); return { rows: result.rows, rowCount: result.rows.length };
    } };
    globalThis.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      assert.equal(url.origin, issuer, "Only the pinned synthetic provider is reachable");
      if (url.pathname === "/neondb/auth/.well-known/jwks.json") return response({ keys: [jwk] });
      assert.equal(url.search, "");
      assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("origin"), origin);
      assert.equal(headers.get("authorization"), null); assert.equal(headers.get("x-forwarded-for"), null);
      const path = url.pathname.replace("/neondb/auth/", "");
      assert.ok(["sign-up/email", "sign-in/email", "get-session", "token", "sign-out", "request-password-reset"].includes(path));
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      captures.push({ path, headers, body }); calls++;
      const overridden = override?.(path); if (overridden) return overridden;
      if (path === "sign-up/email" || path === "sign-in/email") {
        assert.equal(headers.get("cookie"), null);
        assert.equal(Object.hasOwn(body, "callbackURL"), false); assert.equal(body.rememberMe, true);
        assert.deepEqual(Object.keys(body).sort(), path === "sign-up/email" ? ["email", "name", "password", "rememberMe"] : ["email", "password", "rememberMe"]);
        active = true; currentCookie = rawCookie;
        return response({ user: { ...user, admin: "secret-provider-field" }, token: "raw-provider-token", redirect: Boolean(body.callbackURL) }, 200, currentCookie);
      }
      if (path === "request-password-reset") {
        assert.equal(headers.get("cookie"), null); assert.deepEqual(body, { email: user.email, redirectTo: `${origin}/auth/reset-password` });
        return response({ status: true });
      }
      assert.equal(headers.get("cookie"), `${currentCookieName}=${currentCookie}`);
      if (path === "get-session") {
        if (!active) return response(null);
        if (rotate) { currentCookie = rotatedCookie; rotate = false; }
        return response({ user: { ...user, admin: "secret-provider-field" }, session: { userId, expiresAt: new Date(Date.now() + 86400000).toISOString(), token: "raw-provider-token", ipAddress: "secret-provider-field" } }, 200, currentCookie);
      }
      if (path === "token") return response({ token: accessToken });
      active = false; return response({ success: true });
    };

    await t.test("Register/login return an encrypted session, not raw provider cookies or an API JWT", async () => {
      const registered = await data(await signup.POST(request("auth/sign-up/email", "POST", { email: user.email, name: user.name, password: "synthetic-password-only" }, undefined, { cookie: "admin_session=do-not-forward" })));
      assert.equal(registered.status, "authenticated"); assert.deepEqual(registered.user, user);
      assert.equal(registered.sessionToken.split(".").length, 5);
      const loggedIn = await data(await login()); assert.equal(loggedIn.status, "authenticated");
      assert.equal((await me.GET(request("me", "GET", undefined, `Bearer ${loggedIn.sessionToken}`))).status, 401);
    });

    await t.test("Provider redirect flags never replace the live session check or escape into the native response", async () => {
      try {
        for (const flags of [{ redirect: true }, { twoFactorRedirect: true }, { redirect: true, twoFactorRedirect: true }]) {
          active = true; currentCookie = rawCookie;
          override = path => {
            if (path !== "sign-in/email") return;
            const reply = response({ user, token: "raw-provider-token", ...flags, url: "https://attacker.example.test/must-never-be-forwarded" }, 200, rawCookie);
            reply.headers.set("location", "https://attacker.example.test/must-never-be-forwarded");
            return reply;
          };
          const before = calls, result = await data(await login());
          assert.equal(calls - before, 2, "Login must still check the live provider session");
          assert.equal(result.status, "authenticated"); assert.deepEqual(result.user, user);
          assert.equal(result.sessionToken.split(".").length, 5);
          assert.equal(result.redirect, undefined); assert.equal(result.twoFactorRedirect, undefined); assert.equal(result.url, undefined);
        }
      } finally { override = undefined; }
    });

    await t.test("Provider flags alone, a missing cookie, or an invalid live session cannot authenticate", async () => {
      try {
        override = path => path === "sign-in/email" ? response({ redirect: true, twoFactorRedirect: true }) : undefined;
        await data(await login(), 503); assert.equal(warnings.at(-1)!.diagnostic.reason, "auth_user_invalid");
        override = path => path === "sign-in/email" ? response({ user, redirect: true, twoFactorRedirect: true }) : undefined;
        await data(await login(), 503); assert.equal(warnings.at(-1)!.diagnostic.reason, "session_cookie_missing");
        for (const invalid of [null,
          { user, session: { userId: "different-account", expiresAt: new Date(Date.now() + 86400000).toISOString() } },
          { user, session: { userId, expiresAt: new Date(Date.now() - 60000).toISOString() } },
        ]) {
          override = path => path === "sign-in/email" ? response({ user, redirect: true, twoFactorRedirect: true }, 200, rawCookie) :
            path === "get-session" ? response(invalid) : undefined;
          const before = calls, result = await data(await login(), 401);
          assert.equal(calls - before, 2); assert.equal(result.error.code, "AUTH_SESSION_INVALID"); assert.equal(result.sessionToken, undefined);
        }
      } finally { override = undefined; }
    });

    await t.test("Session restore, cookie rotation, JWT retrieval, and existing /me work end-to-end", async () => {
      const loggedIn = await data(await login()); rotate = true;
      const restored = await data(await session.GET(request("auth/get-session", "GET", undefined, `Session ${loggedIn.sessionToken}`)));
      assert.deepEqual(restored.user, user); assert.notEqual(restored.sessionToken, loggedIn.sessionToken);
      const jwt = await data(await token.GET(request("auth/token", "GET", undefined, `Session ${restored.sessionToken}`)));
      assert.equal(jwt.accessToken, accessToken); assert.equal(jwt.tokenType, "Bearer");
      const own = await data(await me.GET(request("me", "GET", undefined, `Bearer ${jwt.accessToken}`)));
      assert.equal(own.user.status, "active");
      assert.equal((await local.query("SELECT * FROM users WHERE subject=$1", [userId])).rows.length, 1);
      await data(await signout.POST(request("auth/sign-out", "POST", undefined, `Session ${jwt.sessionToken}`)));
      await data(await session.GET(request("auth/get-session", "GET", undefined, `Session ${jwt.sessionToken}`)), 401);
    });

    await t.test("Canonical Neon SDK cookie and both legacy names preserve signup, restore, rotation, JWT and logout", async () => {
      try {
        for (const name of ["__Secure-neon-auth.session_token", "__Secure-neonauth.session_token", "neonauth.session_token"]) {
          currentCookieName = name;
          const registered = await data(await signup.POST(request("auth/sign-up/email", "POST", { email: user.email, name: user.name, password: "synthetic-password-only" })));
          assert.equal(registered.status, "authenticated"); rotate = true;
          const restored = await data(await session.GET(request("auth/get-session", "GET", undefined, `Session ${registered.sessionToken}`)));
          const jwt = await data(await token.GET(request("auth/token", "GET", undefined, `Session ${restored.sessionToken}`)));
          assert.equal(jwt.accessToken, accessToken);
          await data(await signout.POST(request("auth/sign-out", "POST", undefined, `Session ${jwt.sessionToken}`)));
          await data(await session.GET(request("auth/get-session", "GET", undefined, `Session ${jwt.sessionToken}`)), 401);
        }
      } finally { currentCookieName = "__Secure-neon-auth.session_token"; }
    });

    await t.test("Unrecognized/cache/admin/ambiguous/malformed cookies never become an authenticated session", async () => {
      try {
        for (const name of ["admin_session", "__Secure-neon-auth.local.session_data", "__Secure-neon-auth.session_token.attacker", "attacker__Secure-neon-auth.session_token"]) {
          override = path => path === "sign-up/email" ? Response.json({ user, token: "raw-provider-token" }, { headers: { "set-cookie": `${name}=synthetic-only-value; Secure` } }) : undefined;
          const beforeWarnings = warnings.length;
          const result = await data(await signup.POST(request("auth/sign-up/email", "POST", { email: user.email, name: user.name, password: "synthetic-password-only" })), 503);
          assert.equal(result.error.code, "AUTH_UNAVAILABLE");
          assert.equal(warnings.length, beforeWarnings + 1);
          assert.equal(warnings.at(-1)!.diagnostic.reason, "session_cookie_missing");
          assert.equal(warnings.at(-1)!.diagnostic.requestId, result.requestId);
          assert.equal(warnings.at(-1)!.diagnostic.stage, "sign-up/email");
        }
        override = path => {
          if (path !== "sign-up/email") return;
          const headers = new Headers();
          headers.append("set-cookie", "__Secure-neon-auth.session_token=canonical.value; Secure");
          headers.append("set-cookie", "__Secure-neonauth.session_token=legacy.value; Secure");
          return Response.json({ user, token: "raw-provider-token" }, { headers });
        };
        await data(await signup.POST(request("auth/sign-up/email", "POST", { email: user.email, name: user.name, password: "synthetic-password-only" })), 503);
        assert.equal(warnings.at(-1)!.diagnostic.reason, "session_cookie_ambiguous");
        override = path => path === "sign-up/email" ? Response.json({ user, token: "raw-provider-token" }, { headers: { "set-cookie": "__Secure-neon-auth.session_token=invalid:value; Secure" } }) : undefined;
        await data(await signup.POST(request("auth/sign-up/email", "POST", { email: user.email, name: user.name, password: "synthetic-password-only" })), 503);
        assert.equal(warnings.at(-1)!.diagnostic.reason, "session_cookie_invalid");
      } finally { override = undefined; }
    });

    await t.test("Missing/tampered/wrong-purpose/cross-provider sessions are rejected before upstream access", async () => {
      const loggedIn = await data(await login());
      const key = new Uint8Array(hkdfSync("sha256", process.env.AUTH_SECRET!, "musmove", "native-auth-session-v1", 32));
      const expired = await new EncryptJWT({ provider: base, cookie: { name: "__Secure-neonauth.session_token", value: currentCookie } })
        .setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "musmove-session+jwe" }).setIssuer(origin).setAudience("musmove-auth-session")
        .setSubject(userId).setIssuedAt(Math.floor(Date.now() / 1000) - 120).setExpirationTime(Math.floor(Date.now() / 1000) - 60).encrypt(key);
      const wrongPurpose = await new EncryptJWT({ provider: base, cookie: { name: "__Secure-neonauth.session_token", value: currentCookie } })
        .setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "musmove-session+jwe" }).setIssuer(origin).setAudience("not-auth")
        .setSubject(userId).setIssuedAt().setExpirationTime("1h").encrypt(key);
      const before = calls;
      for (const value of [undefined, `Bearer ${accessToken}`, `Session ${loggedIn.sessionToken.slice(0, -3)}xxx`, `Session ${expired}`, `Session ${wrongPurpose}`, "Session " + "x".repeat(9000)]) {
        await data(await session.GET(request("auth/get-session", "GET", undefined, value)), 401);
      }
      process.env.NEON_AUTH_BASE_URL = "https://different.example.test/auth";
      await data(await session.GET(request("auth/get-session", "GET", undefined, `Session ${loggedIn.sessionToken}`)), 401);
      process.env.NEON_AUTH_BASE_URL = base;
      assert.equal(calls, before);
    });

    await t.test("Strict input rejects redirects, roles, query tokens, foreign origins, and cookie-only auth", async () => {
      const before = calls;
      for (const extra of [{ callbackURL: "https://attacker.test" }, { role: "admin" }, { rememberMe: false }, { providerUrl: "http://127.0.0.1" }]) {
        await data(await signin.POST(request("auth/sign-in/email", "POST", { email: user.email, password: "synthetic-password-only", ...extra })), 400);
      }
      await data(await signin.POST(request("auth/sign-in/email", "POST", { email: user.email, password: "synthetic-password-only" }, undefined, { origin: "https://attacker.test" })), 403);
      await data(await signin.POST(request("auth/sign-in/email", "POST", { email: user.email, password: "synthetic-password-only" }, undefined, { "sec-fetch-site": "cross-site" })), 403);
      await data(await token.GET(request("auth/token?token=never-in-query")), 400);
      await data(await token.GET(request("auth/token", "GET", undefined, undefined, { cookie: "__Secure-neonauth.session_token=not-authentication" })), 401);
      await data(await signout.POST(request("auth/sign-out", "POST", {})), 400);
      await data(await reset.POST(request("auth/request-password-reset", "POST", { email: user.email, redirectTo: "https://attacker.test" })), 400);
      const options = await signin.OPTIONS(request("auth/sign-in/email", "OPTIONS")); assert.equal(options.status, 204);
      assert.equal(options.headers.get("access-control-allow-credentials"), null);
      assert.equal(calls, before);
    });

    await t.test("No-session signup respects provider verification policy without claiming email was delivered", async () => {
      override = path => path === "sign-up/email" ? response({ user: { ...user, emailVerified: false }, token: null }) : undefined;
      const result = await data(await signup.POST(request("auth/sign-up/email", "POST", { email: user.email, name: user.name, password: "synthetic-password-only" })));
      assert.equal(result.status, "verification_required"); assert.equal(result.sessionToken, null);
      override = undefined;
    });

    await t.test("Reset requests have fixed callbacks and generic account-safe responses", async () => {
      const accepted = await data(await reset.POST(request("auth/request-password-reset", "POST", { email: user.email })));
      override = path => path === "request-password-reset" ? response({ code: "USER_NOT_FOUND" }, 400) : undefined;
      assert.deepEqual(await data(await reset.POST(request("auth/request-password-reset", "POST", { email: user.email }))), accepted);
      override = undefined;
    });

    await t.test("Provider subject changes, forged JWTs, and missing logout acknowledgment fail closed", async () => {
      const loggedIn = await data(await login());
      const auth = `Session ${loggedIn.sessionToken}`;
      override = path => path === "get-session" ? response({ user: { ...user, id: "different-account" }, session: { userId: "different-account", expiresAt: new Date(Date.now() + 86400000).toISOString() } }) : undefined;
      await data(await session.GET(request("auth/get-session", "GET", undefined, auth)), 401);
      override = path => path === "token" ? response({ token: "forged.payload.signature" }) : undefined;
      await data(await token.GET(request("auth/token", "GET", undefined, auth)), 503);
      override = path => path === "sign-out" ? response({ success: false }) : undefined;
      await data(await signout.POST(request("auth/sign-out", "POST", undefined, auth)), 503);
      override = undefined;
    });

    await t.test("Provider failures are bounded, sanitized, not forwarded as redirects or raw console errors", async () => {
      const originalError = console.error, logs: unknown[][] = []; console.error = (...values) => { logs.push(values); };
      try {
        for (const failure of [
          () => response({ code: "INVALID_EMAIL_OR_PASSWORD", message: "secret-provider-field" }, 401),
          () => response({ code: "MISSING_ORIGIN", message: "secret-provider-field" }, 400),
          () => response({ message: "secret-provider-field" }, 429),
          () => new Response("secret-provider-field", { status: 502, headers: { "content-type": "text/html" } }),
          () => response({ message: "secret-provider-field" }, 302),
          () => response({ message: "x".repeat(70000) }),
          () => new Response("{", { headers: { "content-type": "application/json" } }),
        ]) {
          const sample = failure();
          override = path => path === "sign-in/email" ? failure() : undefined;
          const result = await data(await login(), sample.status === 401 ? 401 : sample.status === 429 ? 429 : 503);
          assert.doesNotMatch(JSON.stringify(result), /secret-provider-field/);
        }
        assert.equal(logs.length, 0);
      } finally { console.error = originalError; override = undefined; }
    });

    await t.test("Auth config fails closed and dedicated distributed auth limits cannot be bypassed by forwarding headers", async () => {
      const secret = process.env.AUTH_SECRET!; delete process.env.AUTH_SECRET;
      const before = calls; await data(await login(), 503); assert.equal(calls, before); process.env.AUTH_SECRET = secret;
      const fixedHeaders = { "x-vercel-forwarded-for": "203.0.113.22" };
      for (let i = 0; i < 10; i++) {
        await data(await signin.POST(request("auth/sign-in/email", "POST", { email: user.email, password: "synthetic-password-only" }, undefined, fixedHeaders)));
      }
      const beforeLimited = calls;
      const limited = await signin.POST(request("auth/sign-in/email", "POST", { email: user.email, password: "synthetic-password-only" }, undefined, { ...fixedHeaders, "x-forwarded-for": "1.2.3.4" }));
      await data(limited, 429); assert.equal(limited.headers.get("retry-after"), "600"); assert.equal(calls, beforeLimited);
    });

    await t.test("A stalled upstream body times out without leaking credentials or hanging the route", async () => {
      override = path => path === "sign-in/email" ? new Response(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { return new Promise(() => {}); } }), { headers: { "content-type": "application/json" } }) : undefined;
      const started = Date.now();
      await data(await login(), 503);
      assert.ok(Date.now() - started < 12000);
      override = undefined;
    });
    await t.test("Failure diagnostics contain only allowlisted metadata and public request correlation, never credentials", () => {
      assert.ok(warnings.length > 0);
      for (const warning of warnings) {
        assert.equal(warning.message, "Auth proxy failure");
        for (const key of Object.keys(warning.diagnostic)) assert.ok(["event", "requestId", "action", "stage", "reason", "upstreamStatus"].includes(key));
        assert.equal(warning.diagnostic.event, "auth_proxy_failure");
        assert.doesNotMatch(JSON.stringify(warning), /synthetic@example|synthetic-provider-session|synthetic-rotated-session|secret-provider-field|raw-provider-token|private-cache-data|synthetic-password-only|must-never-be-forwarded/);
        assert.equal(JSON.stringify(warning).includes(process.env.AUTH_SECRET!), false);
        assert.equal(JSON.stringify(warning).includes(accessToken), false);
      }
      assert.ok(warnings.some(warning => warning.diagnostic.reason === "upstream_timeout" && warning.diagnostic.upstreamStatus === 200));
      assert.ok(warnings.some(warning => warning.diagnostic.reason === "upstream_content_type" && warning.diagnostic.upstreamStatus === 502));
      assert.ok(warnings.some(warning => warning.diagnostic.reason === "jwt_invalid"));
    });
    assert.ok(captures.length > 0);
  } finally {
    console.warn = savedWarn; globalThis.fetch = savedFetch; globalDb.musmoveDatabase = previousDb; globalDb.musmovePool = previousPool;
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv); await local.close();
  }
});
