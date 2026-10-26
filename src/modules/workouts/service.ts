import { and, desc, eq, gte, isNull, lte, type SQL } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/src/db/client";
import { workoutSessions } from "@/src/db/schema";
import { badRequest } from "@/src/lib/api-error";

export const workoutQuerySchema = z
  .object({
    cursor: z.string().max(256).optional(),
    from: z.iso.date().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    mode: z.enum(["gym", "calisthenics", "mixed"]).optional(),
    to: z.iso.date().optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "from must be before or equal to to",
    path: ["from"],
  });

function decodeOffset(cursor: string | undefined) {
  if (!cursor) return 0;
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      !value ||
      typeof value !== "object" ||
      !("offset" in value) ||
      typeof value.offset !== "number" ||
      !Number.isSafeInteger(value.offset) ||
      value.offset < 0 || value.offset > 100000
    ) {
      throw new Error("invalid");
    }
    return value.offset;
  } catch {
    throw badRequest("INVALID_CURSOR", "The workout cursor is invalid");
  }
}

function encodeOffset(offset: number) {
  return Buffer.from(JSON.stringify({ offset })).toString("base64url");
}

export async function listWorkouts(
  userId: string,
  query: z.infer<typeof workoutQuerySchema>,
) {
  const offset = decodeOffset(query.cursor);
  const filters: SQL[] = [
    eq(workoutSessions.userId, userId),
    isNull(workoutSessions.deletedAt),
  ];
  if (query.from) filters.push(gte(workoutSessions.recordedOn, query.from));
  if (query.to) filters.push(lte(workoutSessions.recordedOn, query.to));
  // Exact session classification: mixed is not silently counted as either mode.
  if (query.mode) filters.push(eq(workoutSessions.mode, query.mode));

  const rows = await getDatabase()
    .select()
    .from(workoutSessions)
    .where(and(...filters))
    .orderBy(
      desc(workoutSessions.recordedOn),
      desc(workoutSessions.startedAt),
      desc(workoutSessions.id),
    )
    .limit(query.limit + 1)
    .offset(offset);
  const hasMore = rows.length > query.limit;

  return {
    items: rows.slice(0, query.limit).map((row) => ({
      id: row.id,
      version: row.version.toString(),
      planId: row.planId,
      mode: row.mode,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      recordedOn: row.recordedOn,
      exerciseSnapshot: row.exerciseSnapshot,
      setLog: row.setLog,
      legacyMetadata: row.legacyMetadata,
      resultMetrics: row.resultMetrics,
      updatedAt: row.updatedAt.toISOString(),
    })),
    nextCursor: hasMore ? encodeOffset(offset + query.limit) : null,
  };
}

