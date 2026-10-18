import { z } from "zod";
import { ApiError } from "@/src/lib/api-error";
import { readProviderJson } from "@/src/lib/provider-json";

export const resetPasswordSchema = z.object({
  token: z.string().min(8).max(2048).refine(s => !/\s/.test(s)),
  newPassword: z.string().min(8).max(128),
}).strict();

export async function completePasswordReset(input: z.infer<typeof resetPasswordSchema>) {
  const base = new URL(process.env.NEON_AUTH_BASE_URL ?? "");
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw new ApiError(503, "AUTH_UNAVAILABLE", "Password reset is unavailable");
  try {
    const response = await fetch(`${base.toString().replace(/\/$/, "")}/reset-password`, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
      headers: { "content-type": "application/json", origin: base.origin }, body: JSON.stringify(input),
    });
    // No provider cookies/headers, password, token, or private response is logged
    // or copied to the client. The provider validates the reset capability.
    if (!response.ok) void response.body?.cancel().catch(() => {});
    if (response.status === 429) throw new ApiError(429, "RESET_RATE_LIMITED", "Wait before trying again", { retryAfterSeconds: 60 });
    if (response.status >= 400 && response.status < 500) throw new ApiError(400, "RESET_REJECTED", "The link is invalid/expired or the password does not meet the provider policy");
    if (!response.ok) throw new Error();
    if ((await readProviderJson(response)).status !== true) throw new Error();
    return { status: "password_changed" };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, "AUTH_UNAVAILABLE", "Password reset is temporarily unavailable; try signing in before retrying");
  }
}
