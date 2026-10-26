import { z } from "zod";

export const trackingTypeSchema = z.enum(["repetitions", "duration"]);
export const holdSecondsSchema = z.number().int().min(1).max(3600);
export const muscleAreas = ["chest", "shoulders", "biceps", "triceps", "forearms", "abs", "obliques", "upperBack", "lats", "lowerBack", "glutes", "quadriceps", "hamstrings", "calves"] as const;
export const muscleTargetsSchema = z.object({
  version: z.literal("1"), primary: z.array(z.enum(muscleAreas)).min(1).max(14),
  secondary: z.array(z.enum(muscleAreas)).max(14),
}).strict().refine(v => new Set([...v.primary, ...v.secondary]).size === v.primary.length + v.secondary.length, "Muscle areas must be unique");
export type MuscleTargets = z.infer<typeof muscleTargetsSchema>;
export const activityCodes = ["02054", "02050", "02024", "02022", "02020", "02056", "02057", "02035"] as const;
export const sessionTimingSchema = z.object({
  source: z.enum(["timer", "user_reported"]), durationSeconds: z.number().int().min(1).max(43200).optional(),
}).strict().superRefine((v, ctx) => {
  if ((v.source === "user_reported") !== (v.durationSeconds !== undefined)) ctx.addIssue({ code: "custom", message: "user_reported requires seconds; timer uses actual startedAt/finishedAt only" });
});
export const resultMetricsSchema = z.object({
  version: z.literal("1"),
  duration: z.object({ seconds: z.number().int().min(1).max(43200).nullable(), source: z.enum(["timer", "user_reported"]).nullable(), reason: z.literal("NOT_RECORDED").nullable(), meaning: z.literal("elapsed_including_rest"), verification: z.literal("client_reported") }).strict(),
  energy: z.object({ kcal: z.number().nonnegative().nullable(), reason: z.string().nullable(), method: z.literal("standard_met_gross_v1"), kind: z.literal("gross_including_resting_energy"),
    activityCode: z.enum(activityCodes).nullable(), met: z.number().positive().nullable(), durationSeconds: z.number().int().positive().nullable(), bodyweightKg: z.number().positive().nullable(),
    bodyweightSource: z.enum(["workout_user_reported", "profile_at_submission"]).nullable(), ageYears: z.number().int().nullable(), categorySource: z.literal("user_reported").nullable(),
    reference: z.string(), referenceUrl: z.url(), estimated: z.literal(true) }).strict(),
  muscles: z.object({ coverage: z.enum(["unknown", "partial", "complete"]), primary: z.array(z.enum(muscleAreas)).max(14), secondary: z.array(z.enum(muscleAreas)).max(14), completedExerciseCount: z.number().int().min(0).max(12),
    unknownExercises: z.array(z.object({ id: z.string().min(1).max(255), mode: z.enum(["gym", "calisthenics"]) }).strict()).max(12), mappingVersion: z.literal("1") }).strict(),
}).strict();
export function validPrescription(v: { trackingType?: string; reps: number | null; targetDurationSeconds?: number | null }) {
  return v.trackingType === "duration" ? v.reps === null && v.targetDurationSeconds != null : v.reps !== null && v.targetDurationSeconds == null;
}
