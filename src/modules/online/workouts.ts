import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { workoutProgramCatalog } from "@/src/db/schema";
import { ApiError, badRequest } from "@/src/lib/api-error";
import { entityPayloadSchemas } from "@/src/modules/sync/dto";
import { completedWorkoutSchema } from "./dto";
import { addExercises, assertWorkoutTimes, canonicalExercises } from "./resources";
import { mutateOnline, publicItem, readItem, readOnline, requireLive } from "./store";
import { canonicalManualExercises } from "./manual-exercises";
import { buildResultMetrics, buildRunResultMetrics } from "@/src/modules/workouts/result-metrics";
import { canonicalRunLog, listRunLog } from "@/src/modules/workouts/run";
import type { JsonObject } from "@/src/db/schema";
import type { DatabaseTransaction } from "@/src/modules/sync/entities";
import { getWorkoutComparison, type ComparisonWorkout } from "@/src/modules/workouts/comparison";
import { groupWorkoutSetLog } from "@/src/modules/workouts/set-log";

// One final submission, never a start/active/set-progress write. Mobile keeps
// the performed prescription and complete set log in memory until finish.
export function recordCompletedWorkout(userId: string, key: string, input: z.infer<typeof completedWorkoutSchema>) {
  if (input.source === "run") return recordRun(userId, key, input);
  return mutateOnline(userId, key, "workout.completed", input, async ctx => {
    if (await readItem(ctx.tx, userId, "workout_session", input.id)) throw badRequest("RESOURCE_ID_REUSE", "Choose a new workout ID");
    if (input.source === "custom") {
      const program = await readItem(ctx.tx, userId, "custom_program", input.programId!);
      // Own deleted programs remain valid provenance for workouts performed
      // before deletion. Never rebuild the performed prescription from them.
      if (!program || program.mode !== input.mode) throw new ApiError(404, "PROGRAM_NOT_AVAILABLE", "Program not found for this account and mode");
    } else if (input.source === "recommended") {
      const [program] = await ctx.tx.select({ id: workoutProgramCatalog.id }).from(workoutProgramCatalog).where(and(
        eq(workoutProgramCatalog.id, input.programId!), eq(workoutProgramCatalog.mode, input.mode as "gym" | "calisthenics"),
      ));
      if (!program) throw new ApiError(404, "PROGRAM_NOT_AVAILABLE", "Catalog program not found for this mode");
    }
    assertWorkoutTimes(input.startedAt, input.finishedAt, input.recordedOn);
    // Shared account/sync lock, writes, change events and response receipt all
    // belong to mutateOnline's single transaction. Never call an exercise API.
    const createdExercises = await addExercises(ctx, input.newExercises);
    // Record actual performed history even if an owned exercise was soft-deleted
    // or a public catalog exercise deactivated while the mobile was training.
    const explicitManual = (input.source === "manual" || input.source === "record") && input.mode === undefined;
    const exercises = explicitManual ? await canonicalManualExercises(ctx.tx, userId, input.exerciseSnapshot) :
      await canonicalExercises(ctx.tx, userId, input.mode!, input.exerciseSnapshot, true);
    const modes = new Set(input.exerciseSnapshot.map(exercise => exercise.mode));
    const mode = explicitManual ? (modes.size === 1 ? input.exerciseSnapshot[0].mode! : "mixed") : input.mode!;
    const resultMetrics = buildResultMetrics(input, mode, exercises, input.setLog);
    const planId = input.programId ?? (input.source === "manual" ? "manual" : "record");
    const data = entityPayloadSchemas.workout_session.parse({ planId, mode, status: "completed",
      startedAt: input.startedAt, finishedAt: input.finishedAt, recordedOn: input.recordedOn,
      exerciseSnapshot: exercises, setLog: input.setLog,
      resultMetrics,
      legacyMetadata: { source: input.source, ...(input.note === undefined ? {} : { note: input.note }) },
    });
    const item = await ctx.put("workout_session", input.id, "0", data);
    const comparison = await getWorkoutComparison(ctx.tx, userId, { ...data, id: input.id });
    return { item: { ...publicItem(item), setLog: groupWorkoutSetLog(data.setLog, mode) }, exercises: createdExercises.map(publicItem), comparison };
  });
}

// The polyline can be ~200 KB: keep it once in workout_sessions, not again in
// the idempotency receipt. An exact retry restores it from the stored workout.
const runReceipt = {
  compact(response: JsonObject): JsonObject {
    const item = response.item as JsonObject, runLog = item.runLog as JsonObject;
    return { ...response, item: { ...item, runLog: listRunLog(runLog) as JsonObject } };
  },
  async restore(tx: DatabaseTransaction, userId: string, response: JsonObject): Promise<JsonObject> {
    const item = response.item as JsonObject, runLog = item.runLog as JsonObject;
    if (!runLog || !runLog.hasRoute || "route" in runLog) return response;
    const stored = await readItem(tx, userId, "workout_session", String(item.id));
    const route = (stored?.runLog as JsonObject | null | undefined)?.route ?? null;
    return { ...response, item: { ...item, runLog: { ...runLog, route } } };
  },
};

function recordRun(userId: string, key: string, input: z.infer<typeof completedWorkoutSchema>) {
  return mutateOnline(userId, key, "workout.completed", input, async ctx => {
    if (await readItem(ctx.tx, userId, "workout_session", input.id)) throw badRequest("RESOURCE_ID_REUSE", "Choose a new workout ID");
    assertWorkoutTimes(input.startedAt, input.finishedAt, input.recordedOn);
    const runLog = canonicalRunLog(input.run!, input.sessionTiming, input.startedAt, input.finishedAt);
    const resultMetrics = buildRunResultMetrics(input, runLog);
    const data = entityPayloadSchemas.workout_session.parse({ planId: "run", mode: "running", status: "completed",
      startedAt: input.startedAt, finishedAt: input.finishedAt, recordedOn: input.recordedOn,
      exerciseSnapshot: [], setLog: [], resultMetrics, runLog,
      legacyMetadata: { source: "run", ...(input.note === undefined ? {} : { note: input.note }) },
    });
    const item = await ctx.put("workout_session", input.id, "0", data);
    const comparison = await getWorkoutComparison(ctx.tx, userId, { ...data, id: input.id });
    return { item: { ...publicItem(item), setLog: [] }, exercises: [], comparison };
  }, runReceipt);
}

export function workoutDetail(userId: string, id: string) {
  return readOnline(userId, async tx => {
    const item = requireLive(await readItem(tx, userId, "workout_session", id));
    const workout = item as unknown as ComparisonWorkout;
    return { item: { ...publicItem(item), setLog: groupWorkoutSetLog(workout.setLog, workout.mode) },
      comparison: await getWorkoutComparison(tx, userId, workout) };
  });
}
