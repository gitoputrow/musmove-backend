import { randomUUID } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/src/db/client";
import { syncSnapshots, syncSnapshotItems, syncState } from "@/src/db/schema";
import { ApiError, badRequest, conflict } from "@/src/lib/api-error";
import { lockActiveAccount } from "@/src/modules/accounts/access";
import { decodeCursor, encodeCursor } from "./encoding";
import { snapshotSource } from "./snapshot-source";

const uuid = z.uuid().transform(s => s.toLowerCase());
export const startSnapshotSchema = z.object({ snapshotId: uuid }).strict();
export const snapshotPageSchema = z.object({ snapshotId: uuid, cursor: z.string().min(1).max(2048).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
const ttlMs = 30 * 60 * 1000;
const metadata = (s: typeof syncSnapshots.$inferSelect) => ({ schemaVersion: 2, snapshotId: s.id, total: s.total, expiresAt: s.expiresAt.toISOString() });

export async function startSnapshot(userId: string, snapshotId: string = randomUUID()) {
  return getDatabase().transaction(async tx => {
    await lockActiveAccount(tx, userId);
    const [state] = await tx.select().from(syncState).where(eq(syncState.userId, userId)).for("update");
    if (!state) throw new Error("Sync state missing");
    // Retrying the same start ID never silently invalidates another client.
    const [existing] = await tx.select().from(syncSnapshots).where(eq(syncSnapshots.id, snapshotId));
    if (existing) {
      if (existing.userId !== userId) throw conflict("SNAPSHOT_ID_UNAVAILABLE", "Choose a new snapshot ID");
      if (existing.expiresAt.getTime() <= Date.now()) throw conflict("SNAPSHOT_EXPIRED", "Start a new snapshot and retain the local outbox");
      return metadata(existing);
    }
    await tx.delete(syncSnapshots).where(and(eq(syncSnapshots.userId, userId), sql`${syncSnapshots.expiresAt} <= now()`));
    const active = await tx.select({ id: syncSnapshots.id }).from(syncSnapshots).where(eq(syncSnapshots.userId, userId)).limit(2);
    if (active.length >= 2) throw conflict("SNAPSHOT_BUSY", "Finish or release an existing snapshot; at most two may be active");
    const source = snapshotSource(userId);
    const budget = await tx.execute<{ total: number; bytes: string }>(sql`SELECT count(*)::integer AS total, coalesce(sum(octet_length(payload::text)),0)::text AS bytes FROM (${source} LIMIT 20001) s`);
    const count = budget.rows[0];
    if (count.total > 20000 || Number(count.bytes) > 32 * 1024 * 1024) throw new ApiError(413, "SNAPSHOT_LIMIT", "Snapshot exceeds 20000 live entities or 32 MiB; contact support without deleting history");
    const [saved] = await tx.insert(syncSnapshots).values({ id: snapshotId, userId, epoch: state.epoch, sequence: state.nextSequence - BigInt(1), total: count.total, expiresAt: new Date(Date.now() + ttlMs) }).returning();
    await tx.execute(sql`INSERT INTO sync_snapshot_items(snapshot_id,position,entity_type,entity_id,version,updated_at,payload)
      SELECT ${snapshotId}::uuid, row_number() over(order by entity_type COLLATE "C",entity_id COLLATE "C")::integer,entity_type,entity_id,version,updated_at,payload
      FROM (${source}) s`);
    return metadata(saved);
  }, { isolationLevel: "repeatable read" });
}

export async function snapshotPage(userId: string, query: z.infer<typeof snapshotPageSchema>) {
  let position = 0;
  if (query.cursor) {
    const decoded = decodeCursor(query.cursor, `snapshot:${userId}`);
    if (decoded.epoch !== query.snapshotId || BigInt(decoded.sequence) > BigInt(20000)) throw badRequest("INVALID_CURSOR", "Snapshot cursor belongs to a different snapshot");
    position = Number(decoded.sequence);
  }
  return getDatabase().transaction(async tx => {
    const [snapshot] = await tx.select().from(syncSnapshots).where(and(eq(syncSnapshots.id, query.snapshotId), eq(syncSnapshots.userId, userId), sql`${syncSnapshots.expiresAt} > now()`));
    if (!snapshot) throw conflict("SNAPSHOT_EXPIRED", "Snapshot is unavailable; restart without clearing the local outbox");
    const [state] = await tx.select({ epoch: syncState.epoch }).from(syncState).where(eq(syncState.userId, userId));
    if (!state || state.epoch !== snapshot.epoch) throw conflict("SNAPSHOT_EXPIRED", "The account sync epoch changed; restart snapshot");
    const rows = await tx.select().from(syncSnapshotItems).where(and(eq(syncSnapshotItems.snapshotId, snapshot.id), gt(syncSnapshotItems.position, position))).orderBy(syncSnapshotItems.position).limit(query.limit);
    const items = []; let bytes = 0, last = position;
    for (const row of rows) {
      const item = { entityType: row.entityType, entityId: row.entityId, version: row.version.toString(), updatedAt: row.updatedAt.toISOString(), payload: row.payload };
      const size = Buffer.byteLength(JSON.stringify(item));
      if (bytes + size > 2 * 1024 * 1024) {
        if (!items.length) throw new ApiError(413, "SNAPSHOT_ENTITY_TOO_LARGE", "A stored entity exceeds the page budget; contact support");
        break;
      }
      items.push(item); bytes += size; last = row.position;
    }
    const complete = last >= snapshot.total;
    return { ...metadata(snapshot), items, complete,
      nextPageCursor: complete ? null : encodeCursor({ userId: `snapshot:${userId}`, epoch: snapshot.id, sequence: String(last) }),
      syncCursor: complete ? encodeCursor({ userId, epoch: snapshot.epoch, sequence: snapshot.sequence.toString() }) : null,
    };
  }, { accessMode: "read only", isolationLevel: "repeatable read" });
}

export async function releaseSnapshot(userId: string, snapshotId: string) {
  await getDatabase().delete(syncSnapshots).where(and(eq(syncSnapshots.id, snapshotId), eq(syncSnapshots.userId, userId)));
  return { status: "released" };
}
