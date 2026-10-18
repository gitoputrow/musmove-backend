import { createHmac, timingSafeEqual } from "node:crypto";
import { badRequest } from "./api-error";
import { isStrongSecret } from "./security/config";

function key() {
  if (!isStrongSecret(process.env.SYNC_CURSOR_SECRET)) throw new Error("Cursor secret missing");
  return process.env.SYNC_CURSOR_SECRET!;
}
export function signToken(purpose: string, value: unknown) {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${body}.${createHmac("sha256", key()).update(`${purpose}\0${body}`).digest("base64url")}`;
}
export function verifyToken(purpose: string, token: string): unknown {
  try {
    const [body, mac, extra] = token.split(".");
    if (extra !== undefined || token.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(body ?? "") || !/^[A-Za-z0-9_-]{43}$/.test(mac ?? "")) throw new Error();
    const supplied = Buffer.from(mac, "base64url");
    const expected = createHmac("sha256", key()).update(`${purpose}\0${body}`).digest();
    if (supplied.toString("base64url") !== mac || supplied.length !== expected.length || !timingSafeEqual(supplied, expected) || Buffer.from(body, "base64url").toString("base64url") !== body) throw new Error();
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch { throw badRequest("INVALID_CURSOR", "The cursor is invalid for this account or endpoint"); }
}
