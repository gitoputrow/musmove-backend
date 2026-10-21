import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { workoutProgramCatalog } from "@/src/db/schema";
import { ApiError, badRequest } from "@/src/lib/api-error";
import { entityPayloadSchemas } from "@/src/modules/sync/dto";
import { completedWorkoutSchema } from "./dto";
import { addExercises, assertWorkoutTimes, canonicalExercises } from "./resources";
import { mutateOnline, publicItem, readItem, readOnline, requireLive } from "./store";

// One final submission, never a start/active/set-progress write. Mobile keeps
// the performed prescription and complete set log in memory until finish.
export function recordCompletedWorkout(userId: string, key: string, input: z.infer<typeof completedWorkoutSchema>) {
  return mutateOnline(userId, key, "workout.completed", input, async ctx => {
    if (await readItem(ctx.tx, userId, "workout_session", input.id)) throw badRequest("RESOURCE_ID_REUSE", "Choose a new workout ID");
    if (input.source === "custom") {
      const program = await readItem(ctx.tx, userId, "custom_program", input.programId!);
      // Own deleted programs remain valid provenance for workouts performed
      // before deletion. Never rebuild the performed prescription from them.
      if (!program || program.mode !== input.mode) throw new ApiError(404, "PROGRAM_NOT_AVAILABLE", "Program not found for this account and mode");
    } else if (input.source === "recommended") {
      const [program] = await ctx.tx.select({ id: workoutProgramCatalog.id }).from(workoutProgramCatalog).where(and(
        eq(workoutProgramCatalog.id, input.programId!), eq(workoutProgramCatalog.mode, input.mode),
      ));
      if (!program) throw new ApiError(404, "PROGRAM_NOT_AVAILABLE", "Catalog program not found for this mode");
    }
    assertWorkoutTimes(input.startedAt, input.finishedAt, input.recordedOn);
    // Shared account/sync lock, writes, change events and response receipt all
    // belong to mutateOnline's single transaction. Never call an exercise API.
    const createdExercises = await addExercises(ctx, input.newExercises);
    // Record actual performed history even if an owned exercise was soft-deleted
    // or a public catalog exercise deactivated while the mobile was training.
    const exercises = await canonicalExercises(ctx.tx, userId, input.mode, input.exerciseSnapshot, true);
    const data = entityPayloadSchemas.workout_session.parse({ planId: input.programId ?? "manual", mode: input.mode, status: "completed",
      startedAt: input.startedAt, finishedAt: input.finishedAt, recordedOn: input.recordedOn,
      exerciseSnapshot: exercises, setLog: input.setLog,
      legacyMetadata: { source: input.source, ...(input.note === undefined ? {} : { note: input.note }) },
    });
    const item = await ctx.put("workout_session", input.id, "0", data);
    return { item: publicItem(item), exercises: createdExercises.map(publicItem) };
  });
}

export function workoutDetail(userId: string, id: string) {
  return readOnline(userId, async tx => ({ item: publicItem(requireLive(await readItem(tx, userId, "workout_session", id))) }));
}
