import { z } from "zod";

export const trackingTypeSchema = z.enum(["repetitions", "duration"]);
export const holdSecondsSchema = z.number().int().min(1).max(3600);
export const muscleAreas = ["chest", "shoulders", "biceps", "triceps", "forearms", "abs", "obliques", "upperBack", "lats", "lowerBack", "glutes", "quadriceps", "hamstrings", "calves"] as const;
export const muscleTargetsSchema = z.object({
  version: z.literal("1"), primary: z.array(z.enum(muscleAreas)).min(1).max(14),
  secondary: z.array(z.enum(muscleAreas)).max(14),
}).strict().refine(v => new Set([...v.primary, ...v.secondary]).size === v.primary.length + v.secondary.length, "Muscle areas must be unique");
export type MuscleTargets = z.infer<typeof muscleTargetsSchema>;
export const sessionTimingSchema = z.object({
  source: z.enum(["timer", "user_reported"]), durationSeconds: z.number().int().min(1).max(43200).optional(),
}).strict().superRefine((v, ctx) => {
  if ((v.source === "user_reported") !== (v.durationSeconds !== undefined)) ctx.addIssue({ code: "custom", message: "user_reported requires seconds; timer uses actual startedAt/finishedAt only" });
});
const resultMetricFields = {
  duration: z.object({ seconds: z.number().int().min(1).max(43200).nullable(), source: z.enum(["timer", "user_reported"]).nullable(), reason: z.literal("NOT_RECORDED").nullable(), meaning: z.literal("elapsed_including_rest"), verification: z.literal("client_reported") }).strict(),
  muscles: z.object({ coverage: z.enum(["unknown", "partial", "complete"]), primary: z.array(z.enum(muscleAreas)).max(14), secondary: z.array(z.enum(muscleAreas)).max(14), completedExerciseCount: z.number().int().min(0).max(12),
    unknownExercises: z.array(z.object({ id: z.string().min(1).max(255), mode: z.enum(["gym", "calisthenics"]) }).strict()).max(12), mappingVersion: z.literal("1") }).strict(),
};
export const currentResultMetricsSchema = z.object({ version: z.literal("2"), ...resultMetricFields }).strict();
// Read-only compatibility for immutable historical snapshots/receipts. No code
// computes or creates this retired energy payload; clients must not display it.
export const legacyResultMetricsSchema = z.object({
  version: z.literal("1"), ...resultMetricFields,
  energy: z.record(z.string(), z.unknown()).describe("Retired opaque energy snapshot. Historical reads only; ignore in UI. Never generated for new workouts."),
}).strict();
export const resultMetricsSchema = z.discriminatedUnion("version", [currentResultMetricsSchema, legacyResultMetricsSchema]);
export function validPrescription(v: { trackingType?: string; reps: number | null; targetDurationSeconds?: number | null }) {
  return v.trackingType === "duration" ? v.reps === null && v.targetDurationSeconds != null : v.reps !== null && v.targetDurationSeconds == null;
}
