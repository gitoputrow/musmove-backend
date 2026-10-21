import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { exerciseCatalog, userExercises } from "@/src/db/schema";
import { badRequest, conflict } from "@/src/lib/api-error";
import { signToken, verifyToken } from "@/src/lib/signed-token";
import { canonicalRequestHash } from "@/src/modules/sync/encoding";
import { exerciseSchema } from "@/src/modules/sync/dto";
import type { DatabaseTransaction } from "@/src/modules/sync/entities";
import { readMeals } from "@/src/modules/meals/service";
import { idSchema, listSchema, newExercisesSchema, resourceSchemas, versionSchema } from "./dto";
import { columnsFor, expectVersion, mapRow, mutateOnline, payloadOf, publicItem, readItem, readOnline, requireLive, type Mutation, type Resource } from "./store";

const tables = { custom_program: "custom_programs", user_exercise: "user_exercises", meal_entry: "meal_entries", social_draft: "social_drafts" } as const;
export function createSchema(type: Resource) {
  return z.object({ id: idSchema, data: resourceSchemas[type], ...(type === "custom_program" ? { newExercises: newExercisesSchema.optional() } : {}) }).strict();
}
export function patchSchema(type: Resource) {
  // Cross-field refinements apply only AFTER merging with persisted state.
  // Build from the shape: Zod correctly disallows partial() on refined objects.
  const changes = z.object(resourceSchemas[type].shape as z.ZodRawShape).partial().strict();
  return z.object({ baseVersion: versionSchema,
    changes: changes.refine(v => Object.keys(v).length > 0, "Provide changed fields"),
    ...(type === "custom_program" ? { newExercises: newExercisesSchema.optional() } : {}),
  }).strict();
}
export async function canonicalExercises(tx: DatabaseTransaction, userId: string, mode: string, input: unknown, allowHistorical = false) {
  const exercises = z.array(exerciseSchema).min(1).max(12).parse(input);
  return Promise.all(exercises.map(async prescription => {
    const [catalog] = await tx.select().from(exerciseCatalog).where(and(eq(exerciseCatalog.id, prescription.id),
      eq(exerciseCatalog.mode, mode as "gym" | "calisthenics"), allowHistorical ? undefined : eq(exerciseCatalog.active, true)));
    if (catalog) return { ...prescription, idLabel: catalog.idLabel, enLabel: catalog.enLabel, requirements: catalog.requirements };
    const [custom] = await tx.select().from(userExercises).where(and(eq(userExercises.userId, userId), eq(userExercises.id, prescription.id),
      eq(userExercises.mode, mode as "gym" | "calisthenics"), allowHistorical ? undefined : sql`${userExercises.deletedAt} IS NULL`));
    if (!custom) throw badRequest("EXERCISE_NOT_AVAILABLE", "Choose an active exercise of the selected mode belonging to this account or the catalog");
    return { ...prescription, idLabel: custom.name, enLabel: custom.name, requirements: [[]] };
  }));
}
export async function addExercises(ctx: Mutation, input: unknown) {
  const items = newExercisesSchema.parse(input ?? []);
  const created = [];
  for (const item of items) {
    if (await readItem(ctx.tx, ctx.userId, "user_exercise", item.id)) throw conflict("RESOURCE_ID_REUSE", "Choose a new exercise ID");
    // Catalog IDs must never be shadowed by a custom exercise.
    const [catalog] = await ctx.tx.select({ id: exerciseCatalog.id }).from(exerciseCatalog).where(eq(exerciseCatalog.id, item.id)).limit(1);
    if (catalog) throw conflict("RESOURCE_ID_REUSE", "Catalog exercise ID cannot be used for a custom exercise");
    created.push(await ctx.put("user_exercise", item.id, "0", item.data));
  }
  return created;
}
async function journals(ctx: Mutation, dates: unknown[]) {
  const result = [];
  for (const date of new Set(dates.filter((v): v is string => typeof v === "string"))) {
    const { summary, targets, warnings } = await readMeals(ctx.tx, ctx.userId, { date, limit: 1, offset: 0 });
    result.push({ date, summary, targets, warnings });
  }
  return result;
}
export function listResource(userId: string, type: Resource, query: z.infer<typeof listSchema>) {
  return readOnline(userId, async tx => {
    if (query.mode && (type === "meal_entry" || type === "social_draft")) throw badRequest("VALIDATION_ERROR", "This collection does not accept mode");
    const scope = `online-list:${userId}:${type}`;
    const binding = canonicalRequestHash({ mode: query.mode ?? null });
    const cursor = query.cursor ? z.object({ after: idSchema, binding: z.literal(binding) }).strict().parse(verifyToken(scope, query.cursor)) : null;
    // ID keyset is stable across edits; inserts before the cursor require a fresh list.
    const rows = await tx.execute<Record<string, unknown> & { id: string }>(sql`SELECT ${columnsFor(type)} FROM ${sql.identifier(tables[type])}
      WHERE user_id=${userId} AND deleted_at IS NULL ${query.mode ? sql`AND mode=${query.mode}` : sql``}
      ${cursor ? sql`AND id > ${cursor.after}` : sql``} ORDER BY id LIMIT ${query.limit + 1}`);
    const page = rows.rows.slice(0, query.limit);
    const items = page.map(row => publicItem(mapRow(row, row.id)));
    return { items, nextCursor: rows.rows.length > query.limit ? signToken(scope, { after: page.at(-1)!.id, binding }) : null };
  });
}
export function detailResource(userId: string, type: Resource, id: string) {
  return readOnline(userId, async tx => ({ item: publicItem(requireLive(await readItem(tx, userId, type, id))) }));
}
export function createResource(userId: string, key: string, type: Resource, body: z.infer<ReturnType<typeof createSchema>>) {
  return mutateOnline(userId, key, `${type}.create`, body, async ctx => {
    if (await readItem(ctx.tx, userId, type, body.id)) throw conflict("RESOURCE_ID_REUSE", "Choose a new resource ID; deleted IDs cannot be reused");
    let data = resourceSchemas[type].parse(body.data) as Record<string, unknown>;
    if (type === "custom_program") {
      await addExercises(ctx, body.newExercises);
      data = { ...data, exercisePrescriptions: await canonicalExercises(ctx.tx, userId, String(data.mode), data.exercisePrescriptions) };
    }
    if (type === "user_exercise") {
      const [existing] = await ctx.tx.select({ id: exerciseCatalog.id }).from(exerciseCatalog).where(eq(exerciseCatalog.id, body.id)).limit(1);
      if (existing) throw conflict("RESOURCE_ID_REUSE", "Catalog exercise ID cannot be used for a custom exercise");
    }
    const item = await ctx.put(type, body.id, "0", data);
    return { item: publicItem(item), ...(type === "meal_entry" ? { journals: await journals(ctx, [item.recordedOn]) } : {}),
      ...(type === "custom_program" ? { exercises: await Promise.all(newExercisesSchema.parse(body.newExercises ?? []).map(async e => publicItem(requireLive(await readItem(ctx.tx, userId, "user_exercise", e.id))))) } : {}) };
  });
}
export function patchResource(userId: string, key: string, type: Resource, id: string, body: z.infer<ReturnType<typeof patchSchema>>) {
  return mutateOnline(userId, key, `${type}.patch:${id}`, body, async ctx => {
    const old = requireLive(await readItem(ctx.tx, userId, type, id)); expectVersion(old, body.baseVersion);
    let data = resourceSchemas[type].parse({ ...payloadOf(old), ...body.changes }) as Record<string, unknown>;
    if (type === "custom_program") {
      await addExercises(ctx, body.newExercises);
      if ("exercisePrescriptions" in body.changes || "mode" in body.changes) data = { ...data,
        exercisePrescriptions: await canonicalExercises(ctx.tx, userId, String(data.mode), data.exercisePrescriptions) };
      else if (newExercisesSchema.parse(body.newExercises ?? []).length) throw badRequest("EXERCISES_NOT_USED", "New exercises require updated exercisePrescriptions");
    }
    const item = await ctx.put(type, id, body.baseVersion, data);
    return { item: publicItem(item), ...(type === "meal_entry" ? { journals: await journals(ctx, [old.recordedOn, item.recordedOn]) } : {}),
      ...(type === "custom_program" ? { exercises: await Promise.all(newExercisesSchema.parse(body.newExercises ?? []).map(async e => publicItem(requireLive(await readItem(ctx.tx, userId, "user_exercise", e.id))))) } : {}) };
  });
}
export function removeResource(userId: string, key: string, type: Resource | "workout_session", id: string, baseVersion: string) {
  return mutateOnline(userId, key, `${type}.delete:${id}`, { baseVersion }, async ctx => {
    const old = requireLive(await readItem(ctx.tx, userId, type, id));
    const item = await ctx.remove(type, id, baseVersion);
    return { id, deleted: true, version: item.version, ...(type === "meal_entry" ? { journals: await journals(ctx, [old.recordedOn]) } : {}) };
  });
}

export function assertWorkoutTimes(startedAt: string, finishedAt: string | null, recordedOn: string) {
  if (finishedAt && Date.parse(finishedAt) < Date.parse(startedAt)) throw badRequest("INVALID_WORKOUT_TIME", "finishedAt must not precede startedAt");
  const utcDay = Date.parse(`${new Date(startedAt).toISOString().slice(0, 10)}T00:00:00Z`);
  if (Math.abs(Date.parse(`${recordedOn}T00:00:00Z`) - utcDay) > 86400000) throw badRequest("WORKOUT_DATE_MISMATCH", "recordedOn must match the local start date");
}
