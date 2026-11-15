import { z } from "zod";
import { explicitWorkoutSetLogSchema, workoutSetLogSchema } from "@/src/modules/sync/dto";

export const workoutSetResultSchema = workoutSetLogSchema.omit({ exerciseId: true });
export const workoutSetLogGroupSchema = z.object({
  exerciseId: explicitWorkoutSetLogSchema.shape.exerciseId,
  exerciseMode: z.enum(["gym", "calisthenics"]).optional(),
  sets: z.array(workoutSetResultSchema).max(10),
}).strict();
export const workoutSetLogInputSchema = z.union([
  z.array(explicitWorkoutSetLogSchema).max(120),
  z.array(workoutSetLogGroupSchema).max(12),
]);
export const workoutSetLogOutputSchema = z.array(workoutSetLogGroupSchema.extend({
  exerciseMode: z.enum(["gym", "calisthenics"]).nullable(),
}));
type Input = z.infer<typeof workoutSetLogInputSchema>;
type FlatSet = z.infer<typeof explicitWorkoutSetLogSchema>;

export function flattenWorkoutSetLog(logs: Input): FlatSet[] {
  return logs.flatMap(entry => "sets" in entry ? entry.sets.map(set => ({
    ...set, exerciseId: entry.exerciseId,
    ...(entry.exerciseMode === undefined ? {} : { exerciseMode: entry.exerciseMode }),
  })) : [entry]);
}

export function groupWorkoutSetLog(logs: readonly FlatSet[], sessionMode: string): z.infer<typeof workoutSetLogOutputSchema> {
  const groups = new Map<string, z.infer<typeof workoutSetLogOutputSchema>[number]>();
  for (const log of logs) {
    const { exerciseId, exerciseMode: explicitMode, ...set } = log;
    const mode = explicitMode ?? sessionMode;
    // A malformed legacy mixed reference must not be assigned to a guessed mode.
    const exerciseMode = mode === "gym" || mode === "calisthenics" ? mode : null;
    const key = JSON.stringify([exerciseMode, exerciseId]);
    let group = groups.get(key);
    if (!group) { group = { exerciseId, exerciseMode, sets: [] }; groups.set(key, group); }
    group.sets.push(set);
  }
  return [...groups.values()];
}
