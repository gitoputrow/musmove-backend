import { createRemoteJWKSet, jwtVerify } from "jose";

import { and, eq, sql } from "drizzle-orm";

import { getDatabase } from "@/src/db/client";
import { revokedIdentities, syncState, users } from "@/src/db/schema";
import { identityHash } from "./identity-hash";

import { forbidden, unauthorized } from "../api-error";
import { isProduction } from "../security/config";

export interface Identity {
  email: string | null;
  internalUserId: string;
  issuer: string;
  subject: string;
}

let remoteKeys:
  | {
      baseUrl: string;
      jwks: ReturnType<typeof createRemoteJWKSet>;
    }
  | undefined;

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) throw unauthorized();
  if (authorization.length > 8192) throw unauthorized("The access token is too large");

  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) throw unauthorized("Authorization must use a Bearer token");
  return match[1];
}

function authConfiguration() {
  const rawBaseUrl = process.env.NEON_AUTH_BASE_URL;
  if (!rawBaseUrl) {
    throw new Error("NEON_AUTH_BASE_URL is required for API authentication");
  }

  const parsed = new URL(rawBaseUrl);
  const local = !isProduction() && parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if ((!local && parsed.protocol !== "https:") || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.origin.length > 255) {
    throw new Error("NEON_AUTH_BASE_URL must be a trusted HTTPS Auth endpoint");
  }
  const baseUrl = parsed.toString().replace(/\/$/, "");
  const issuer = parsed.origin;

  if (!remoteKeys || remoteKeys.baseUrl !== baseUrl) {
    remoteKeys = {
      baseUrl,
      jwks: createRemoteJWKSet(new URL(`${baseUrl}/.well-known/jwks.json`), { timeoutDuration: 5000, cooldownDuration: 30000, cacheMaxAge: 600000 }),
    };
  }

  return { audience: issuer, issuer, jwks: remoteKeys.jwks };
}

export async function verifyIdentity(request: Request, options: { allowInactive?: boolean } = {}): Promise<Identity> {
  const token = bearerToken(request);
  const configuration = authConfiguration();

  let payload;
  try {
    ({ payload } = await jwtVerify(token, configuration.jwks, {
      algorithms: ["EdDSA"],
      audience: configuration.audience,
      issuer: configuration.issuer,
      requiredClaims: ["sub", "exp", "iat"],
      maxTokenAge: 900,
      clockTolerance: 5,
    }));
  } catch {
    throw unauthorized("The access token is invalid or expired");
  }

  if (typeof payload.sub !== "string" || !payload.sub.trim() || payload.sub.length > 255 || payload.sub.includes("\0") || payload.role !== "authenticated" || payload.banned !== false
    || typeof payload.exp !== "number" || typeof payload.iat !== "number" || payload.exp <= payload.iat || payload.exp - payload.iat > 905) {
    throw unauthorized("The access token cannot access this API");
  }

  const database = getDatabase();
  const user = await database.transaction(async (transaction) => {
    const hash = identityHash(configuration.issuer, payload.sub!);
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${hash},0))`);
    const [revoked] = await transaction.select().from(revokedIdentities).where(and(eq(revokedIdentities.identityHash, hash), sql`${revokedIdentities.expiresAt} > now()`)).limit(1);
    if (revoked) throw unauthorized("The identity has been deleted");
    const [mappedUser] = await transaction
      .insert(users)
      .values({
        issuer: configuration.issuer,
        subject: payload.sub!,
      })
      .onConflictDoNothing({
        target: [users.issuer, users.subject],
      })
      .returning({ id: users.id, status: users.status });

    const mapped = mappedUser ?? (await transaction.select({ id: users.id, status: users.status }).from(users)
      .where(and(eq(users.issuer, configuration.issuer), eq(users.subject, payload.sub!))).limit(1))[0];
    if (!mapped) throw unauthorized();

    await transaction
      .insert(syncState)
      .values({ userId: mapped.id })
      .onConflictDoNothing({ target: syncState.userId });

    return mapped;
  });

  if (user.status !== "active" && !options.allowInactive) {
    throw forbidden("ACCOUNT_INACTIVE", `The account is ${user.status}`);
  }

  const email = typeof payload.email === "string" ? payload.email : null;
  return {
    email,
    internalUserId: user.id,
    issuer: configuration.issuer,
    subject: payload.sub,
  };
}
