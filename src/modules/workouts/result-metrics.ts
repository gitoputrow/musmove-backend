import type { z } from "zod";
import type { WorkoutExercisePrescription, WorkoutSetLog } from "@/src/db/schema/types";
import { badRequest } from "@/src/lib/api-error";
import { muscleTargetsSchema, sessionTimingSchema } from "./measurement";

// Standard gross MET estimate, not measured active/net energy. Category must be
// explicitly reported, never inferred from profile mode, names or lifted volume.
export const metActivities = {
  "02054": { met: 3.5, label: "Resistance training, multiple exercises, 8–15 reps" },
  "02050": { met: 6, label: "Weight lifting, vigorous effort" },
  "02024": { met: 2.8, label: "Calisthenics, light effort" },
  "02022": { met: 3.8, label: "Calisthenics, moderate effort" },
  "02020": { met: 7.5, label: "Calisthenics, vigorous effort" },
  "02056": { met: 3, label: "Bodyweight resistance, general" },
  "02057": { met: 6.5, label: "Bodyweight resistance, high intensity" },
  "02035": { met: 5, label: "Circuit training, moderate effort" },
} as const;
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
  sessionTiming?: z.infer<typeof sessionTimingSchema>; energyActivityCode?: keyof typeof metActivities; workoutBodyweightKg?: number;
};
export function buildResultMetrics(input: MetricsInput, profile: { ageYears: number | null; weightKg: number | null } | undefined,
  mode: string, exercises: WorkoutExercisePrescription[], logs: WorkoutSetLog[], now = new Date()) {
  let seconds: number | null = null;
  if (input.sessionTiming) {
    if (input.source !== "manual" && input.sessionTiming.source !== "timer") throw badRequest("INVALID_SESSION_TIMING", "Program workout timing must use its reported timer timestamps");
    seconds = input.sessionTiming.source === "timer" ? Math.floor((Date.parse(input.finishedAt) - Date.parse(input.startedAt)) / 1000) : input.sessionTiming.durationSeconds!;
    if (seconds < 1 || seconds > 43200) throw badRequest("INVALID_SESSION_TIMING", "Session duration must be 1–43200 seconds");
  }
  const knownHold = logs.filter(l => l.completed).reduce((n, l) => n + (l.durationSeconds ?? 0), 0);
  if (seconds !== null && knownHold > seconds) throw badRequest("INCONSISTENT_WORKOUT_DURATION", "Reported completed hold time exceeds the session duration");
  const activity = input.energyActivityCode ? metActivities[input.energyActivityCode] : null;
  const recent = Math.abs(now.getTime() - Date.parse(input.finishedAt)) <= 86400000;
  const weight = input.workoutBodyweightKg ?? (recent ? profile?.weightKg ?? null : null);
  const reason = seconds === null ? "DURATION_UNKNOWN" : !activity ? "ACTIVITY_REQUIRED" : !profile?.ageYears ? "AGE_REQUIRED" :
    profile.ageYears < 19 || profile.ageYears > 59 ? "AGE_OUTSIDE_REFERENCE" : weight === null ? (recent ? "BODYWEIGHT_REQUIRED" : "WORKOUT_BODYWEIGHT_REQUIRED") :
    weight < 1 || weight > 500 ? "BODYWEIGHT_OUT_OF_SCOPE" : seconds > 10800 ? "DURATION_OUT_OF_SCOPE" :
    !logs.some(l => l.completed) ? "NO_COMPLETED_SETS" : Date.parse(input.finishedAt) > now.getTime() + 60000 ? "FUTURE_WORKOUT" : null;
  return { version: "1", duration: { seconds, source: input.sessionTiming?.source ?? null, reason: seconds === null ? "NOT_RECORDED" : null, meaning: "elapsed_including_rest", verification: "client_reported" },
    energy: { kcal: reason === null ? Math.round(activity!.met * 3.5 * weight! / 200 * (seconds! / 60) * 10) / 10 : null,
      reason, method: "standard_met_gross_v1", kind: "gross_including_resting_energy", activityCode: input.energyActivityCode ?? null,
      met: activity?.met ?? null, durationSeconds: seconds, bodyweightKg: weight,
      bodyweightSource: input.workoutBodyweightKg !== undefined ? "workout_user_reported" : weight !== null ? "profile_at_submission" : null,
      ageYears: profile?.ageYears ?? null, categorySource: input.energyActivityCode ? "user_reported" : null,
      reference: "2024 Adult Compendium (ages 19–59)", referenceUrl: "https://pacompendium.com/conditioning-exercise/", estimated: true },
    muscles: muscleCoverage(mode, exercises, logs) };
}
