import { ApiError } from "@/src/lib/api-error";

// Per-process guard. Production replicas still need a shared gateway/Redis limit.
const attempts = new Map<string, { count: number; expires: number }>();
let inFlight = 0;
export async function withEquipmentScanLimit<T>(userId: string, action: () => Promise<T>) {
  const now = Date.now();
  for (const [id, value] of attempts) if (value.expires <= now) attempts.delete(id);
  let budget = attempts.get(userId);
  if (inFlight >= 2 || (budget?.count ?? 0) >= 5 || (!budget && attempts.size >= 10000)) {
    throw new ApiError(429, "SCAN_RATE_LIMITED", "Too many photo scans; retry later");
  }
  if (!budget) { budget = { count: 0, expires: now + 60000 }; attempts.set(userId, budget); }
  budget.count++;
  inFlight++;
  try { return await action(); } finally { inFlight--; }
}
