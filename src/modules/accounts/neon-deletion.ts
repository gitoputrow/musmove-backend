import type { IdentityDeletionProvider } from "./deletion";
import { readProviderJson } from "@/src/lib/provider-json";

export class NeonDeletionProvider implements IdentityDeletionProvider {
  async remove(issuer: string, subject: string) {
    const base = new URL(process.env.NEON_AUTH_BASE_URL ?? "");
    const cookie = process.env.NEON_AUTH_ADMIN_COOKIE;
    if (base.protocol !== "https:" || base.origin !== issuer || base.username || base.password || base.search || base.hash
      || !cookie || cookie.length > 16384 || /[\r\n]/.test(cookie)) throw new Error("Provider admin session required");
    // This is a managed Auth admin SESSION cookie, not a Neon control-plane API
    // key or a mobile JWT. It is loaded only by trusted operational tooling.
    for (const action of ["revoke-user-sessions", "remove-user"]) {
      const response = await fetch(`${base.toString().replace(/\/$/, "")}/admin/${action}`, {
        method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
        headers: { "content-type": "application/json", cookie, origin: base.origin }, body: JSON.stringify({ userId: subject }),
      });
      const data = await readProviderJson(response);
      if (response.ok && data.success === true) continue;
      // Only a semantic user-not-found is authoritative. A route 404, expired
      // admin session, timeout or other error never authorizes local erasure.
      if ((response.status === 400 || response.status === 404) && data.code === "USER_NOT_FOUND") return;
      throw new Error("Provider deletion not acknowledged");
    }
  }
}
