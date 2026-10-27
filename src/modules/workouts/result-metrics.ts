import type { z } from "zod";
import type { WorkoutExercisePrescription, WorkoutSetLog } from "@/src/db/schema/types";
import { badRequest } from "@/src/lib/api-error";
import { muscleTargetsSchema, sessionTimingSchema } from "./measurement";

export function muscleCoverage(mode: string, exercises: WorkoutExercisePrescription[], logs: WorkoutSetLog[]) {
  const performed = exercises.filter(e => logs.some(l => l.completed && l.exerciseId === e.id && (l.exerciseMode ?? mode) === (e.mode ?? mode) && l.setNumber >= 1 && l.setNumber <= e.sets));
  const primary = new Set<string>(), secondary = new Set<string>();
  const unknownExercises: { id: string; mode: string }[] = [];
  for (const e of performed) {
    const parsed = muscleTargetsSchema.safeParse(e.muscleTargets);
    if (!parsed.success) { unknownExercises.push({ id: e.id, mode: e.mode ?? mode }); continue; }
    parsed.data.primary.forEach(m => primary.add(m)); parsed.data.secondary.forEach(m => secondary.add(m));
  }
  return { coverage: !performed.length || unknownExercises.length === performed.length ? "unknown" : unknownExercises.length ? "partial" : "complete",
    primary: [...primary].sort(), secondary: [...secondary].filter(m => !primary.has(m)).sort(),
    completedExerciseCount: performed.length, unknownExercises, mappingVersion: "1" };
}
type MetricsInput = {
  source: string; startedAt: string; finishedAt: string;
  sessionTiming?: z.infer<typeof sessionTimingSchema>;
};
export function buildResultMetrics(input: MetricsInput, mode: string, exercises: WorkoutExercisePrescription[], logs: WorkoutSetLog[]) {
  let seconds: number | null = null;
  if (input.sessionTiming) {
    if (input.source !== "manual" && input.sessionTiming.source !== "timer") throw badRequest("INVALID_SESSION_TIMING", "Program workout timing must use its reported timer timestamps");
    seconds = input.sessionTiming.source === "timer" ? Math.floor((Date.parse(input.finishedAt) - Date.parse(input.startedAt)) / 1000) : input.sessionTiming.durationSeconds!;
    if (seconds < 1 || seconds > 43200) throw badRequest("INVALID_SESSION_TIMING", "Session duration must be 1–43200 seconds");
  }
  const knownHold = logs.filter(l => l.completed).reduce((n, l) => n + (l.durationSeconds ?? 0), 0);
  if (seconds !== null && knownHold > seconds) throw badRequest("INCONSISTENT_WORKOUT_DURATION", "Reported completed hold time exceeds the session duration");
  return { version: "2", duration: { seconds, source: input.sessionTiming?.source ?? null, reason: seconds === null ? "NOT_RECORDED" : null, meaning: "elapsed_including_rest", verification: "client_reported" },
    muscles: muscleCoverage(mode, exercises, logs) };
}
