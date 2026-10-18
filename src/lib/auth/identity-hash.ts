import { createHash } from "node:crypto";
export function identityHash(issuer: string, subject: string) {
  return createHash("sha256").update(`musmove-deleted-identity-v1\0${issuer}\0${subject}`).digest("hex");
}
