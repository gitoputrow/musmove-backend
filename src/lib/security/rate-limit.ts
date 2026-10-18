import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { getPool } from "@/src/db/client";
import { ApiError } from "../api-error";
import { isProduction, isStrongSecret } from "./config";

export const RATE_LIMIT_SQL = `
WITH expired AS (
  DELETE FROM api_rate_limits WHERE bucket_key IN (
    SELECT bucket_key FROM api_rate_limits WHERE reset_at < now() - interval '1 day' AND bucket_key <> $1
    ORDER BY reset_at LIMIT 25 FOR UPDATE SKIP LOCKED
  )
)
INSERT INTO api_rate_limits (bucket_key, requests, reset_at)
VALUES ($1, 1, now() + $2 * interval '1 millisecond')
ON CONFLICT (bucket_key) DO UPDATE SET
  requests = CASE WHEN api_rate_limits.reset_at <= now() THEN 1 ELSE api_rate_limits.requests + 1 END,
  reset_at = CASE WHEN api_rate_limits.reset_at <= now() THEN EXCLUDED.reset_at ELSE api_rate_limits.reset_at END
WHERE api_rate_limits.reset_at <= now() OR api_rate_limits.requests < $3
RETURNING requests`;

const local = new Map<string, { requests: number; resetAt: number }>();
export async function consumeRateLimit(scope: string, identity: string, limit: number, windowMs = 60000) {
  const secret = process.env.API_RATE_LIMIT_SECRET;
  const key = createHmac("sha256", secret ?? "local-development-rate-limit-only").update(`${scope}\0${identity}`).digest("hex");
  let allowed: boolean;
  if (isProduction()) {
    if (!isStrongSecret(secret)) throw new ApiError(503, "RATE_LIMIT_UNAVAILABLE", "Request protection is not configured");
    try {
      const result = await getPool().query(RATE_LIMIT_SQL, [key, windowMs, limit]);
      allowed = result.rowCount === 1;
    } catch { throw new ApiError(503, "RATE_LIMIT_UNAVAILABLE", "Request protection is temporarily unavailable"); }
  } else {
    const now = Date.now();
    for (const [key, bucket] of local) if (bucket.resetAt <= now) local.delete(key);
    let bucket = local.get(key);
    if (!bucket) {
      if (local.size >= 10000) throw new ApiError(429, "RATE_LIMITED", "Too many requests; retry later");
      bucket = { requests: 0, resetAt: now + windowMs }; local.set(key, bucket);
    }
    allowed = ++bucket.requests <= limit;
  }
  if (!allowed) throw new ApiError(429, "RATE_LIMITED", "Too many requests; retry later", { retryAfterSeconds: Math.ceil(windowMs / 1000) });
}

export function rateLimitIdentity(request: Request) {
  let ip = "local-untrusted-proxy";
  if (process.env.VERCEL === "1") {
    const forwarded = request.headers.get("x-vercel-forwarded-for");
    if (!forwarded || !isIP(forwarded)) throw new ApiError(503, "TRUSTED_PROXY_REQUIRED", "The request proxy is not configured");
    // Never trust an arbitrary forwarded chain or IP supplied by a mobile app.
    ip = isIP(forwarded) === 6 ? new URL(`http://[${forwarded}]/`).hostname : forwarded;
  }
  // On self-hosted production, a conservative shared IP bucket applies until
  // a trusted proxy adapter is explicitly implemented; spoofed headers ignored.
  return ip;
}

export async function enforceIpLimit(request: Request) {
  if (request.method === "OPTIONS") return;
  await consumeRateLimit("ip-api", rateLimitIdentity(request), isProduction() ? 180 : 5000);
}

export type RatePolicy = "scan" | "bootstrap" | "import" | "social-publish" | "social-report";
export async function enforceUserLimit(request: Request, userId: string, policy?: RatePolicy) {
  await consumeRateLimit("user-api", userId, 120);
  // Policy is bound to the route handler, not an attacker-controlled URL spelling.
  if (policy === "scan") await consumeRateLimit("user-scan", userId, 5);
  else if (policy === "bootstrap") await consumeRateLimit("user-bootstrap", userId, 5);
  else if (policy === "import") await consumeRateLimit("user-import", userId, 2, 600000);
  else if (policy === "social-publish") await consumeRateLimit("user-social-publish", userId, 3, 600000);
  else if (policy === "social-report") await consumeRateLimit("user-social-report", userId, 10, 600000);
  else if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) await consumeRateLimit("user-write", userId, 30);
}
