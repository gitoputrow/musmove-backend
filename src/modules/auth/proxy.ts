import "server-only";
import { hkdfSync } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import { z } from "zod";
import { ApiError } from "@/src/lib/api-error";
import { verifyAccessToken } from "@/src/lib/auth/verify-identity";
import { apiJson, optionsHandler, publicHandler, readJson } from "@/src/lib/http";
import { readProviderValue } from "@/src/lib/provider-json";
import { authProxyConfigurationIssues } from "@/src/lib/security/config";
import { consumeRateLimit, rateLimitIdentity } from "@/src/lib/security/rate-limit";

const email = z.email().max(254).transform(value => value.trim());
const credentials = z.object({ email, password: z.string().min(1).max(128) }).strict();
const signup = credentials.extend({ name: z.string().trim().min(1).max(120), password: z.string().min(8).max(128) });
const reset = z.object({ email }).strict();
const userSchema = z.object({ id: z.string().min(1).max(255), email: z.email().max(254), name: z.string().max(120), emailVerified: z.boolean() });
// Canonical name from @neondatabase/auth server/constants; retain legacy
// names for existing encrypted envelopes. Never accept a prefix/wildcard match.
const sessionCookieNames = ["__Secure-neon-auth.session_token", "__Secure-neonauth.session_token", "neonauth.session_token"] as const;
const cookieSchema = z.object({ name: z.enum(sessionCookieNames), value: z.string().regex(/^[A-Za-z0-9._~%+/=-]{1,4096}$/) }).strict();
type SessionCookie = z.infer<typeof cookieSchema>;
const sessionSchema = z.object({ user: userSchema, session: z.object({ userId: z.string(), expiresAt: z.iso.datetime({ offset: true }) }) });
type AuthAction = "sign-up/email" | "sign-in/email" | "get-session" | "token" | "sign-out" | "request-password-reset";
const MAX_SESSION_SECONDS = 30 * 86400;
const invalidSession = () => new ApiError(401, "AUTH_SESSION_INVALID", "The session is invalid or expired; sign in again");
type FailureReason = "cookie_header_invalid" | "session_cookie_ambiguous" | "session_cookie_invalid" | "session_cookie_missing"
  | "upstream_timeout" | "upstream_content_type" | "upstream_http" | "upstream_transport" | "upstream_json"
  | "reset_ack_invalid" | "auth_user_invalid" | "interactive_flow_unsupported" | "session_shape_invalid"
  | "jwt_shape_invalid" | "jwt_invalid" | "logout_ack_invalid";
class AuthProxyFailure extends ApiError {
  constructor(readonly reason: FailureReason, readonly stage: AuthAction, readonly upstreamStatus?: number) {
    super(503, "AUTH_UNAVAILABLE", "Authentication is temporarily unavailable; check the result before retrying a mutation");
  }
}
const unavailable = (reason: FailureReason, stage: AuthAction, status?: number) => new AuthProxyFailure(reason, stage, status);

function configuration() {
  try {
    if (authProxyConfigurationIssues().length) throw new Error();
    const base = new URL(process.env.NEON_AUTH_BASE_URL ?? "");
    const origin = new URL(process.env.AUTH_PUBLIC_ORIGIN ?? "https://musmove-backend.vercel.app");
    const secret = process.env.AUTH_SECRET;
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash
      || origin.protocol !== "https:" || origin.toString() !== `${origin.origin}/`
      || origin.username || origin.password) throw new Error();
    return { base: base.toString().replace(/\/$/, ""), origin: origin.origin,
      key: new Uint8Array(hkdfSync("sha256", secret!, "musmove", "native-auth-session-v1", 32)) };
  } catch { throw new ApiError(503, "AUTH_CONFIGURATION_REQUIRED", "Authentication configuration must be completed by the operator"); }
}
type Configuration = ReturnType<typeof configuration>;

function cookieUpdate(response: Response, stage: AuthAction, current?: SessionCookie): SessionCookie | undefined {
  let result = current;
  const seen = new Set<string>();
  for (const line of response.headers.getSetCookie()) {
    if (line.length > 8192) throw unavailable("cookie_header_invalid", stage, response.status);
    const [pair, ...attributes] = line.split(";");
    const separator = pair.indexOf("=");
    if (separator < 1) continue;
    const name = pair.slice(0, separator).trim();
    if (!sessionCookieNames.some(allowed => allowed === name)) continue;
    seen.add(name);
    if (seen.size > 1) throw unavailable("session_cookie_ambiguous", stage, response.status);
    const value = pair.slice(separator + 1).trim();
    if (!value || attributes.some(attribute => {
      const age = /^\s*max-age\s*=\s*(-?\d+)\s*$/i.exec(attribute);
      return age !== null && Number(age[1]) <= 0;
    })) throw invalidSession();
    const parsed = cookieSchema.safeParse({ name, value });
    if (!parsed.success) throw unavailable("session_cookie_invalid", stage, response.status);
    result = parsed.data;
  }
  return result;
}

async function provider(config: Configuration, path: AuthAction, body?: unknown, cookie?: SessionCookie) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let response: Response | undefined;
  let parsing = false;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(unavailable("upstream_timeout", path, response?.status)); }, 10000);
    });
    return await Promise.race([timeout, (async () => {
      response = await fetch(`${config.base}/${path}`, {
        method: body === undefined ? "GET" : "POST", redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { accept: "application/json", origin: config.origin,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(cookie ? { cookie: `${cookie.name}=${cookie.value}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.status === 429) throw new ApiError(429, "AUTH_RATE_LIMITED", "Wait before trying again", { retryAfterSeconds: 60 });
      const mime = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
      if (mime !== "application/json") throw unavailable("upstream_content_type", path, response.status);
      parsing = true;
      const data = await readProviderValue(response, 65536);
      if (!response.ok) {
        const code = data && typeof data === "object" && "code" in data ? data.code : undefined;
        if (["MISSING_ORIGIN", "INVALID_ORIGIN", "INVALID_CALLBACK_URL", "INVALID_REDIRECT_URL"].includes(String(code))) {
          throw new ApiError(503, "AUTH_CONFIGURATION_REQUIRED", "The operator must configure the authentication origin and callback allowlist");
        }
        if (response.status >= 500 || response.status < 400 || response.status === 404) throw unavailable("upstream_http", path, response.status);
        if (path === "request-password-reset" && code === "USER_NOT_FOUND") return { data: { status: true }, cookie: undefined };
        if (code === "EMAIL_NOT_VERIFIED") throw new ApiError(403, "AUTH_EMAIL_VERIFICATION_REQUIRED", "Complete the verification required by the identity provider");
        if (path === "sign-up/email") throw new ApiError(400, "AUTH_SIGN_UP_REJECTED", "Registration could not be completed; check your details or try signing in");
        if (path === "sign-in/email") throw new ApiError(401, "AUTH_INVALID_CREDENTIALS", "Sign-in failed; check your credentials");
        if (path === "request-password-reset") throw unavailable("upstream_http", path, response.status);
        throw invalidSession();
      }
      return { data, cookie: path === "sign-out" ? undefined : cookieUpdate(response, path, cookie) };
    })()]);
  } catch (error) {
    controller.abort();
    void response?.body?.cancel().catch(() => {});
    if (error instanceof ApiError) throw error;
    // Never expose fetch errors (which can include URLs), upstream bodies, or credentials.
    throw unavailable(parsing ? "upstream_json" : "upstream_transport", path, response?.status);
  } finally { clearTimeout(timer); }
}

async function openSession(request: Request, config: Configuration) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Session ([A-Za-z0-9_.-]{1,8192})$/i.exec(header);
  if (!match) throw invalidSession();
  try {
    const { payload, protectedHeader } = await jwtDecrypt(match[1], config.key, {
      issuer: config.origin, audience: "musmove-auth-session", keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"], maxTokenAge: `${MAX_SESSION_SECONDS}s`,
      requiredClaims: ["iat", "exp", "sub"],
    });
    if (protectedHeader.typ !== "musmove-session+jwe" || payload.provider !== config.base || typeof payload.sub !== "string") throw new Error();
    return { cookie: cookieSchema.parse(payload.cookie), userId: payload.sub };
  } catch { throw invalidSession(); }
}

async function activeSession(config: Configuration, cookie: SessionCookie, userId: string) {
  const reply = await provider(config, "get-session", undefined, cookie);
  if (reply.data === null) throw invalidSession();
  const parsed = sessionSchema.safeParse(reply.data);
  if (!parsed.success) throw unavailable("session_shape_invalid", "get-session");
  if (!reply.cookie) throw unavailable("session_cookie_missing", "get-session");
  const { user, session } = parsed.data;
  if (user.id !== userId || session.userId !== userId || Date.parse(session.expiresAt) <= Date.now()) throw invalidSession();
  const expires = Math.min(Math.floor(Date.parse(session.expiresAt) / 1000), Math.floor(Date.now() / 1000) + MAX_SESSION_SECONDS);
  const sessionToken = await new EncryptJWT({ provider: config.base, cookie: reply.cookie })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "musmove-session+jwe" })
    .setIssuer(config.origin).setAudience("musmove-auth-session").setSubject(user.id)
    .setIssuedAt().setExpirationTime(expires).encrypt(config.key);
  return { user, sessionToken, sessionExpiresAt: new Date(expires * 1000).toISOString(), cookie: reply.cookie };
}

export function authRoute(action: AuthAction) {
  return publicHandler(async ({ request, requestId }) => {
    try { return await handleAuthAction(action, request); }
    catch (error) {
      if (error instanceof AuthProxyFailure) {
        // Construct the log explicitly. Never spread errors, headers, provider
        // bodies, cookies, user data, tokens or environment into diagnostics.
        console.warn("Auth proxy failure", {
          event: "auth_proxy_failure", requestId, action, stage: error.stage, reason: error.reason,
          ...(error.upstreamStatus === undefined ? {} : { upstreamStatus: error.upstreamStatus }),
        });
      }
      throw error;
    }
  });
}

async function handleAuthAction(action: AuthAction, request: Request) {
  if (new URL(request.url).search) throw new ApiError(400, "VALIDATION_ERROR", "Authentication endpoints do not accept query parameters");
  const config = configuration();
  const origin = request.headers.get("origin");
  if ((origin && origin !== config.origin && origin !== process.env.APP_ORIGIN)
    || request.headers.get("sec-fetch-site") === "cross-site") throw new ApiError(403, "ORIGIN_NOT_ALLOWED", "The request origin is not allowed");
  const ip = rateLimitIdentity(request);
  const isCredentials = action === "sign-up/email" || action === "sign-in/email";
  await consumeRateLimit(`auth-${action}`, ip, isCredentials ? 10 : action === "request-password-reset" ? 5 : 60, isCredentials || action === "request-password-reset" ? 600000 : 60000);
  if (isCredentials || action === "request-password-reset") {
    // A new sign-in must not silently reuse another account's cookie/session.
    if (request.headers.has("authorization")) throw new ApiError(400, "VALIDATION_ERROR", "Do not attach a session or JWT to this endpoint");
    const input = (action === "sign-up/email" ? signup : action === "sign-in/email" ? credentials : reset).parse(await readJson(request, 8192));
    const reply = await provider(config, action, action === "request-password-reset"
      ? { ...input, redirectTo: `${config.origin}/auth/reset-password` }
      : { ...input, rememberMe: true, callbackURL: `${config.origin}/auth/mobile` });
    if (action === "request-password-reset") {
      if (!reply.data || typeof reply.data !== "object" || !("status" in reply.data) || reply.data.status !== true) throw unavailable("reset_ack_invalid", action);
      return apiJson({ status: "accepted", message: "If the account is eligible, a password reset email will be sent" });
    }
    const result = reply.data && typeof reply.data === "object" ? reply.data as Record<string, unknown> : {};
    const user = userSchema.safeParse(result.user);
    if (!user.success) throw unavailable("auth_user_invalid", action);
    if (result.redirect === true || result.twoFactorRedirect === true) throw unavailable("interactive_flow_unsupported", action);
    if (!reply.cookie) {
      if (action !== "sign-up/email" || result.token) throw unavailable("session_cookie_missing", action);
      return apiJson({ status: user.data.emailVerified ? "sign_in_required" : "verification_required", user: user.data, sessionToken: null, sessionExpiresAt: null });
    }
    const { cookie: _cookie, ...session } = await activeSession(config, reply.cookie, user.data.id);
    void _cookie;
    return apiJson({ status: "authenticated", ...session });
  }
  if (request.body !== null) throw new ApiError(400, "VALIDATION_ERROR", "This endpoint does not accept a request body");
  const session = await openSession(request, config);
  if (action === "sign-out") {
    const reply = await provider(config, "sign-out", {}, session.cookie);
    if (!reply.data || typeof reply.data !== "object" || !("success" in reply.data) || reply.data.success !== true) throw unavailable("logout_ack_invalid", action);
    return apiJson({ status: "signed_out" });
  }
  // Always check the live provider session. The encrypted envelope alone is not authorization.
  const { cookie, ...active } = await activeSession(config, session.cookie, session.userId);
  if (action === "get-session") return apiJson({ status: "authenticated", ...active });
  const reply = await provider(config, "token", undefined, cookie);
  const token = reply.data && typeof reply.data === "object" && "token" in reply.data ? reply.data.token : undefined;
  if (typeof token !== "string" || token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw unavailable("jwt_shape_invalid", action);
  try {
    if ((await verifyAccessToken(token)).subject !== active.user.id) throw new Error();
  } catch { throw unavailable("jwt_invalid", action); }
  // Recheck after /token if the provider rotated the session cookie there too.
  const refreshed = reply.cookie && (reply.cookie.value !== cookie.value || reply.cookie.name !== cookie.name) ? await activeSession(config, reply.cookie, session.userId) : null;
  return apiJson({ status: "authenticated", ...active, ...(refreshed ? { sessionToken: refreshed.sessionToken, sessionExpiresAt: refreshed.sessionExpiresAt } : {}), accessToken: token, tokenType: "Bearer" });
}

export const authOptions = optionsHandler;
