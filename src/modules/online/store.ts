import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/src/db/client";
import { operationReceipts, syncChanges, syncState } from "@/src/db/schema";
import type { JsonObject, JsonValue } from "@/src/db/schema";
import { ApiError, badRequest, conflict } from "@/src/lib/api-error";
import { lockActiveAccount } from "@/src/modules/accounts/access";
import { canonicalRequestHash } from "@/src/modules/sync/encoding";
import { entityPayloadSchemas, type EntityType } from "@/src/modules/sync/dto";
import { readEntityVersion, resolveEntityPayload, tombstoneEntity, upsertEntity, validateEntityTransition, type DatabaseTransaction } from "@/src/modules/sync/entities";
import { lockSyncState } from "@/src/modules/sync/service";

const descriptors = {
  profile: { table: "profiles", key: "user_id" },
  training_preferences: { table: "training_preferences", key: "user_id" },
  user_preferences: { table: "user_preferences", key: "user_id" },
  custom_program: { table: "custom_programs", key: "id" },
  user_exercise: { table: "user_exercises", key: "id" },
  workout_session: { table: "workout_sessions", key: "id" },
  meal_entry: { table: "meal_entries", key: "id" },
  social_draft: { table: "social_drafts", key: "id" },
  place_favorite: { table: "place_favorites", key: "place_id" },
} as const;
export type OnlineEntity = keyof typeof descriptors;
export type Resource = "custom_program" | "user_exercise" | "meal_entry" | "social_draft";
export type Item = Record<string, unknown> & { id: string; version: string; updatedAt: string; deletedAt: string | null };
const MAX = BigInt("9223372036854775807");
const camel = (v: string) => v.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

export function columnsFor(type: OnlineEntity) {
  // Explicit DTO projection: future internal columns must not become API fields.
  const fields = Object.keys(entityPayloadSchemas[type].shape).map(key => key === "nutrition" ? "nutrition_per_serving" : key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`));
  return sql.join([
    ...(descriptors[type].key === "user_id" ? [] : [descriptors[type].key]), ...fields,
    ...(type === "meal_entry" ? ["calories_kcal", "protein_grams"] : []), "version", "updated_at", "deleted_at",
  ].map(field => sql`${sql.identifier(field)}`), sql`, `);
}

// Identifiers come ONLY from this static allowlist, never from a request.
export async function readItem(tx: DatabaseTransaction, userId: string, type: OnlineEntity, id: string): Promise<Item | null> {
  const d = descriptors[type];
  const result = await tx.execute<Record<string, unknown>>(sql`SELECT ${columnsFor(type)} FROM ${sql.identifier(d.table)}
    WHERE user_id=${userId} AND ${d.key === "user_id" ? sql`true` : sql`${sql.identifier(d.key)}=${id}`}`);
  const raw = result.rows[0]; if (!raw) return null;
  return mapRow(raw, id);
}
export function mapRow(raw: Record<string, unknown>, id: string): Item {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "user_id") continue;
    const field = camel(key);
    row[field] = value instanceof Date ? value.toISOString() : value;
  }
  for (const key of ["weightKg", "heightCm", "servings", "caloriesKcal", "proteinGrams"]) {
    if (row[key] !== undefined && row[key] !== null) row[key] = Number(row[key]);
  }
  for (const key of ["updatedAt", "deletedAt", "startedAt", "finishedAt", "consumedAt"]) {
    if (typeof row[key] === "string") row[key] = new Date(row[key]).toISOString();
  }
  // pg/PGlite raw date results may be Date or YYYY-MM-DD strings.
  if (row.recordedOn instanceof Date) row.recordedOn = row.recordedOn.toISOString().slice(0, 10);
  if (typeof row.recordedOn === "string") row.recordedOn = row.recordedOn.slice(0, 10);
  return { ...row, id, version: String(row.version), updatedAt: String(row.updatedAt), deletedAt: row.deletedAt ? String(row.deletedAt) : null } as Item;
}
export function publicItem(item: Item) {
  const { deletedAt: _deleted, ...value } = item; void _deleted; return value;
}
export function payloadOf(item: Item) {
  const { id: _id, version: _version, updatedAt: _updated, deletedAt: _deleted, ...payload } = item;
  void _id; void _version; void _updated; void _deleted;
  if ("nutritionPerServing" in payload) {
    payload.nutrition = payload.nutritionPerServing;
    delete payload.nutritionPerServing; delete payload.caloriesKcal; delete payload.proteinGrams;
  }
  delete payload.placeId;
  return payload;
}
export function requireLive(item: Item | null): Item {
  if (!item || item.deletedAt) throw new ApiError(404, "RESOURCE_NOT_FOUND", "Resource not found");
  return item;
}
export function expectVersion(item: Item | null, base: string) {
  if ((item?.version ?? "0") !== base) throw conflict("VERSION_CONFLICT", "Data changed; refresh before saving", { currentVersion: item?.version ?? "0" });
}
export async function readOnline<T>(userId: string, action: (tx: DatabaseTransaction) => Promise<T>) {
  return getDatabase().transaction(async tx => {
    // A shared account lock serializes lifecycle transitions without blocking other reads.
    await lockActiveAccount(tx, userId); return action(tx);
  }, { isolationLevel: "repeatable read" });
}

export async function mutateOnline(userId: string, operationId: string, scope: string, input: unknown,
  action: (context: Mutation) => Promise<unknown>) {
  const kind = `online.v1:${scope}`, requestHash = canonicalRequestHash({ kind, input });
  try {
    return await getDatabase().transaction(async tx => {
      const state = await lockSyncState(tx, userId);
      const [receipt] = await tx.select().from(operationReceipts).where(and(eq(operationReceipts.userId, userId), eq(operationReceipts.operationId, operationId)));
      if (receipt) {
        if (receipt.requestHash !== requestHash || receipt.result.kind !== kind) throw conflict("IDEMPOTENCY_KEY_REUSE", "Key already used for a different request");
        return receipt.result.response as JsonObject;
      }
      let sequence = state.nextSequence;
      const write = async (type: OnlineEntity, id: string, base: string, payload: unknown, remove: boolean) => {
        const current = await readEntityVersion(tx, userId, type as EntityType, id);
        expectVersion(current ? { version: current.version.toString() } as Item : null, base);
        if (BigInt(base) >= MAX || sequence >= MAX) throw conflict("VERSION_LIMIT", "Version limit reached");
        if (remove && (!current || current.deletedAt)) throw new ApiError(404, "RESOURCE_NOT_FOUND", "Resource not found");
        const next = BigInt(base) + BigInt(1);
        if (remove) await tombstoneEntity(tx, userId, type, id, next);
        else {
          await validateEntityTransition(tx, userId, type, id, payload);
          const parsed = entityPayloadSchemas[type].parse(payload);
          const resolved = await resolveEntityPayload(tx, userId, type, parsed, id);
          await upsertEntity(tx, userId, type, id, resolved, next);
        }
        const stored = await readItem(tx, userId, type, id);
        if (!stored) throw new Error("Mutation did not persist");
        await tx.insert(syncChanges).values({ userId, sequence, entityType: type, entityId: id, entityVersion: next,
          operation: remove ? "delete" : "upsert", payload: remove ? null : payloadOf(stored) as JsonValue });
        sequence += BigInt(1); return stored;
      };
      const response = await action({ tx, userId,
        put: (type, id, base, payload) => write(type, id, base, payload, false),
        remove: (type, id, base) => write(type, id, base, null, true),
      });
      const json = JSON.parse(JSON.stringify(response)) as JsonObject;
      if (Buffer.byteLength(JSON.stringify(json)) > 256 * 1024) throw new ApiError(413, "RESPONSE_TOO_LARGE", "Mutation response exceeds the supported size");
      if (sequence !== state.nextSequence) await tx.update(syncState).set({ nextSequence: sequence, updatedAt: new Date() }).where(eq(syncState.userId, userId));
      await tx.insert(operationReceipts).values({ userId, operationId, requestHash, result: { kind, response: json } });
      return json;
    });
  } catch (error) {
    let cause: unknown = error;
    for (let depth = 0; depth < 5 && cause && typeof cause === "object"; depth++) {
      if ("code" in cause && cause.code === "23505") throw conflict("RESOURCE_CONFLICT", "Schedule slot, active workout, or resource ID is already occupied");
      if ("code" in cause && ["23514", "22003", "22007", "22008"].includes(String(cause.code))) throw badRequest("VALIDATION_ERROR", "Values do not satisfy the resource constraints");
      cause = "cause" in cause ? cause.cause : null;
    }
    throw error;
  }
}
export interface Mutation {
  tx: DatabaseTransaction; userId: string;
  put(type: OnlineEntity, id: string, base: string, payload: unknown): Promise<Item>;
  remove(type: OnlineEntity, id: string, base: string): Promise<Item>;
}
