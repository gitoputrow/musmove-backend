import { z } from "zod";

const measurement = z.object({
  trackingType: z.enum(["repetitions", "duration"]), completed: z.boolean(),
  weightKg: z.number().nullable(), reps: z.number().int().nullable(), durationSeconds: z.number().int().nullable(),
}).strict();

export const workoutComparisonSchema = z.object({
  version: z.literal("1"), basis: z.literal("previous_completed_workout"),
  exercises: z.array(z.object({
    exerciseId: z.string().min(1).max(255), exerciseMode: z.enum(["gym", "calisthenics"]),
    previousWorkout: z.object({
      id: z.string(), startedAt: z.iso.datetime({ offset: true }), finishedAt: z.iso.datetime({ offset: true }),
      recordedOn: z.iso.date().nullable(),
    }).strict().nullable(),
    setCount: z.object({
      current: z.number().int().min(0).max(10), previous: z.number().int().min(0).max(10).nullable(),
      delta: z.number().int().min(-10).max(10).nullable(),
    }).strict().describe("Counts of unambiguous completed actual set logs for this exercise, not prescribed sets. Previous counts include all previous set numbers even when the current prescription is shorter. Previous and delta are null without previous history."),
    sets: z.array(z.object({
      setNumber: z.number().int().min(1).max(10), current: measurement.nullable(), previous: measurement.nullable(),
      delta: z.object({ weightKg: z.number().nullable(), reps: z.number().int().nullable(), durationSeconds: z.number().int().nullable() }).strict(),
    }).strict()).max(10),
  }).strict()).max(12),
  run: z.object({
    previousWorkout: z.object({
      id: z.string(), startedAt: z.iso.datetime({ offset: true }), finishedAt: z.iso.datetime({ offset: true }),
      recordedOn: z.iso.date().nullable(),
    }).strict().nullable(),
    distanceMeters: z.object({ current: z.number(), previous: z.number().nullable(), delta: z.number().nullable() }).strict(),
    avgPaceSecondsPerKm: z.object({ current: z.number().int(), previous: z.number().int().nullable(), delta: z.number().int().nullable() }).strict()
      .describe("Negative delta means faster than the previous run."),
    durationSeconds: z.object({ current: z.number().int(), previous: z.number().int().nullable(), delta: z.number().int().nullable() }).strict(),
  }).strict().optional().describe("Running sessions only: comparison with the latest earlier completed, non-deleted run of the account."),
}).strict();

export type WorkoutComparison = z.infer<typeof workoutComparisonSchema>;
