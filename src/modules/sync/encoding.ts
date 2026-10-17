import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { badRequest } from "@/src/lib/api-error";
import { isProduction, isStrongSecret } from "@/src/lib/security/config";

interface CursorPayload {
  epoch: string;
  sequence: string;
  userId: string;
}

function secret() {
  const value = process.env.SYNC_CURSOR_SECRET ?? (!isProduction() ? process.env.AUTH_SECRET : undefined);
  if (!value || value.length < 32 || (isProduction() && !isStrongSecret(value))) {
    throw new Error("SYNC_CURSOR_SECRET or AUTH_SECRET must contain at least 32 characters");
  }
  return value;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
    .join(",")}}`;
}

export function canonicalRequestHash(value: unknown) {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

export function encodeCursor(payload: CursorPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function decodeCursor(cursor: string, expectedUserId: string): CursorPayload {
  const parts = cursor.split(".");
  const [body, suppliedSignature] = parts;
  if (cursor.length > 2048 || parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(body ?? "") || !/^[A-Za-z0-9_-]{43}$/.test(suppliedSignature ?? "")) {
    throw badRequest("INVALID_CURSOR", "The sync cursor is invalid");
  }

  const expectedSignature = createHmac("sha256", secret()).update(body).digest();
  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(suppliedSignature, "base64url");
    if (actualSignature.toString("base64url") !== suppliedSignature || Buffer.from(body, "base64url").toString("base64url") !== body) {
      throw new Error("Noncanonical cursor encoding");
    }
  } catch {
    throw badRequest("INVALID_CURSOR", "The sync cursor is invalid");
  }

  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw badRequest("INVALID_CURSOR", "The sync cursor is invalid");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw badRequest("INVALID_CURSOR", "The sync cursor is invalid");
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("userId" in payload) ||
    !("epoch" in payload) ||
    !("sequence" in payload) ||
    payload.userId !== expectedUserId ||
    typeof payload.epoch !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.epoch) ||
    typeof payload.sequence !== "string" ||
    payload.sequence.length > 19 || !/^(0|[1-9][0-9]*)$/.test(payload.sequence) || BigInt(payload.sequence) > BigInt("9223372036854775807")
  ) {
    throw badRequest("INVALID_CURSOR", "The sync cursor is invalid");
  }

  return payload as CursorPayload;
}
