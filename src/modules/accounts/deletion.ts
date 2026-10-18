import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/src/db/client";
import { accountDeletionJobs, revokedIdentities, users } from "@/src/db/schema";
import { forbidden } from "@/src/lib/api-error";
import { identityHash } from "@/src/lib/auth/identity-hash";

export const DELETION_WAIT_DAYS = 7;
function publicStatus(job: typeof accountDeletionJobs.$inferSelect) {
  return { status: job.status === "completed" ? "completed" : "deletion_requested", deletionRequestId: job.id,
    processingStatus: job.status, requestedAt: job.requestedAt.toISOString(), deleteAfter: job.deleteAfter.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null, waitDays: DELETION_WAIT_DAYS };
}

export async function requestAccountDeletion(userId: string) {
  return getDatabase().transaction(async tx => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!user || !["active", "deletion_requested"].includes(user.status)) throw forbidden("ACCOUNT_INACTIVE", "This account cannot request deletion");
    const [existing] = await tx.select().from(accountDeletionJobs).where(eq(accountDeletionJobs.userId, userId));
    await tx.update(users).set({ status: "deletion_requested", updatedAt: new Date() }).where(eq(users.id, userId));
    if (existing) return publicStatus(existing);
    const [job] = await tx.insert(accountDeletionJobs).values({ userId, deleteAfter: sql`now()+interval '7 days'` }).returning();
    return publicStatus(job);
  });
}

export async function readDeletionStatus(userId: string) {
  const [job] = await getDatabase().select().from(accountDeletionJobs).where(eq(accountDeletionJobs.userId, userId));
  return job ? publicStatus(job) : { status: "not_requested" };
}

export interface IdentityDeletionProvider { remove(issuer: string, subject: string): Promise<void> }

// Operational worker only. No public endpoint may invoke physical deletion.
// Provider deletion must be acknowledged before the application user is purged.
export async function processOneDeletion(provider: IdentityDeletionProvider) {
  const db = getDatabase();
  const claimed = await db.transaction(async tx => {
    const jobs = await tx.select().from(accountDeletionJobs).where(and(
      sql`${accountDeletionJobs.deleteAfter} <= now()`, sql`${accountDeletionJobs.userId} IS NOT NULL`,
      sql`${accountDeletionJobs.status} <> 'completed'`, sql`(${accountDeletionJobs.retryAt} IS NULL OR ${accountDeletionJobs.retryAt} <= now())`,
    )).orderBy(accountDeletionJobs.requestedAt).limit(1).for("update", { skipLocked: true });
    if (!jobs[0]) return null;
    const job = jobs[0];
    const [user] = await tx.select().from(users).where(eq(users.id, job.userId!));
    if (!user || user.status !== "deletion_requested") return null;
    const [lease] = await tx.update(accountDeletionJobs).set({ status: "provider_pending", attempts: job.attempts + 1, retryAt: new Date(Date.now() + 300000) })
      .where(eq(accountDeletionJobs.id, job.id)).returning();
    return { job: lease, issuer: user.issuer, subject: user.subject };
  });
  if (!claimed) return { processed: false };
  const { job, issuer, subject } = claimed;
  try {
    if (!job.providerDeletedAt) await provider.remove(issuer, subject);
    const acknowledged = await db.update(accountDeletionJobs).set({ providerDeletedAt: job.providerDeletedAt ?? new Date() })
      .where(and(eq(accountDeletionJobs.id, job.id), eq(accountDeletionJobs.attempts, job.attempts))).returning();
    if (!acknowledged.length) return { processed: false };
    await db.transaction(async tx => {
      const hash = identityHash(issuer, subject);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${hash},0))`);
      const [current] = await tx.select().from(users).where(eq(users.id, job.userId!)).for("update");
      if (!current || current.status !== "deletion_requested") throw new Error("Deletion state changed");
      const [locked] = await tx.select().from(accountDeletionJobs).where(and(eq(accountDeletionJobs.id, job.id), eq(accountDeletionJobs.attempts, job.attempts))).for("update");
      if (!locked?.providerDeletedAt || locked.deleteAfter.getTime() > Date.now()) throw new Error("Deletion is not ready");
      // Prevent a still-valid, previously issued JWT from provisioning a new user.
      await tx.insert(revokedIdentities).values({ identityHash: hash, expiresAt: new Date(Date.now() + 16 * 60000) })
        .onConflictDoUpdate({ target: revokedIdentities.identityHash, set: { expiresAt: new Date(Date.now() + 16 * 60000) } });
      // Detach only the minimal operational receipt before FK cascades. Other
      // administrative/test removals naturally clean their pending jobs too.
      await tx.update(accountDeletionJobs).set({ userId: null }).where(eq(accountDeletionJobs.id, job.id));
      await tx.delete(users).where(eq(users.id, job.userId!));
      await tx.update(accountDeletionJobs).set({ status: "completed", completedAt: new Date(), lastErrorCode: null, retryAt: null }).where(eq(accountDeletionJobs.id, job.id));
    });
    return { processed: true, status: "completed" };
  } catch {
    await db.update(accountDeletionJobs).set({ status: "failed", lastErrorCode: "DELETION_RETRY_REQUIRED", retryAt: new Date(Date.now() + 15 * 60000) })
      .where(and(eq(accountDeletionJobs.id, job.id), eq(accountDeletionJobs.attempts, job.attempts)));
    return { processed: true, status: "failed" };
  }
}

export async function cleanupOperationalData() {
  const tx = getDatabase();
  // Bounded batches; run even when no deletion is due.
  await tx.execute(sql`DELETE FROM sync_snapshots WHERE id IN (SELECT id FROM sync_snapshots WHERE expires_at <= now() LIMIT 50)`);
  await tx.execute(sql`DELETE FROM revoked_identities WHERE identity_hash IN (SELECT identity_hash FROM revoked_identities WHERE expires_at <= now() LIMIT 100)`);
  await tx.execute(sql`DELETE FROM account_deletion_jobs WHERE id IN (SELECT id FROM account_deletion_jobs WHERE status='completed' AND completed_at < now()-interval '7 days' LIMIT 100)`);
}
