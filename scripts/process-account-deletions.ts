import { sql } from "drizzle-orm";
import { loadOperationsEnvironment } from "./operations-env";

async function main() {
  loadOperationsEnvironment();
  const { getDatabase, getPool } = await import("../src/db/client");
  try {
    const execute = process.argv.includes("--execute");
    const due = await getDatabase().execute<{ count: string }>(sql`SELECT count(*)::text AS count FROM account_deletion_jobs WHERE delete_after <= now() AND status <> 'completed' AND user_id IS NOT NULL`);
    const legacy = await getDatabase().execute<{ count: string }>(sql`SELECT count(*)::text AS count FROM users u WHERE status='deletion_requested' AND NOT EXISTS(SELECT 1 FROM account_deletion_jobs j WHERE j.user_id=u.id)`);
    const states = await getDatabase().execute<{ status: string; count: string }>(sql`SELECT status,count(*)::text AS count FROM account_deletion_jobs GROUP BY status`);
    if (!execute) { console.info({ mode: "dry-run", dueRequests: Number(due.rows[0].count), legacyRequestsNeedingQueue: Number(legacy.rows[0].count), countsByStatus: Object.fromEntries(states.rows.map(r => [r.status, Number(r.count)])), waitDays: 7, providerCredentialsPrinted: false }); return; }
    if (!process.argv.includes("--confirm=DELETE_DUE_ACCOUNTS")) throw new Error("Explicit execution confirmation required");
    // An old live deployment lacks the revoked-identity check and could recreate
    // a purged user from an old JWT. Refuse destructive work before rollout.
    const api = new URL(process.env.MUSMOVE_API_BASE_URL ?? "https://musmove-backend.vercel.app/api/v1");
    if (api.protocol !== "https:" || api.username || api.password || api.search || api.hash) throw new Error("Trusted HTTPS API required");
    const readiness = await fetch(`${api.toString().replace(/\/$/, "")}/meta`, { redirect: "error", signal: AbortSignal.timeout(10000) });
    const { readProviderJson } = await import("../src/lib/provider-json");
    const deployed = await readProviderJson(readiness);
    if (!readiness.ok || deployed.apiVersion !== "1.1.0" || !(deployed.capabilities && typeof deployed.capabilities === "object" && "deletedIdentityGuard" in deployed.capabilities && deployed.capabilities.deletedIdentityGuard === true)) throw new Error("Redeploy identity-guard API before enabling deletion worker");
    // Catch requests made by the previous deployment between migration and
    // rollout. Give previously unqueued requests a fresh safety week.
    await getDatabase().execute(sql`INSERT INTO account_deletion_jobs(user_id,delete_after)
      SELECT id,greatest(updated_at+interval '7 days',now()+interval '7 days') FROM users
      WHERE status='deletion_requested' AND NOT EXISTS(SELECT 1 FROM account_deletion_jobs j WHERE j.user_id=users.id)
      ON CONFLICT DO NOTHING`);
    const { processOneDeletion, cleanupOperationalData } = await import("../src/modules/accounts/deletion");
    const { NeonDeletionProvider } = await import("../src/modules/accounts/neon-deletion");
    const results = [];
    for (let i = 0; i < 10; i++) { const result = await processOneDeletion(new NeonDeletionProvider()); if (!result.processed) break; results.push(result.status); }
    await cleanupOperationalData();
    console.info({ mode: "execute", processed: results.length, completed: results.filter(s => s === "completed").length, failed: results.filter(s => s === "failed").length });
    if (results.includes("failed")) process.exitCode = 1;
  } finally { await getPool().end(); }
}
void main().catch(() => { console.error("Deletion worker failed; credentials, provider replies and account data withheld"); process.exitCode = 1; });
