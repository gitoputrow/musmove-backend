import "server-only";
import { sql } from "drizzle-orm";
import type { WorkoutExercisePrescription, WorkoutSetLog } from "@/src/db/schema/types";
import type { DatabaseTransaction } from "@/src/modules/sync/entities";
import type { WorkoutComparison } from "./comparison-schema";

export interface ComparisonWorkout {
  id: string; mode: string; status: string; startedAt: string | Date;
  exerciseSnapshot: WorkoutExercisePrescription[]; setLog: WorkoutSetLog[];
}
type Previous = {
  exerciseId: string; exerciseMode: string; id: string | null; startedAt: Date | string | null;
  finishedAt: Date | string | null; recordedOn: Date | string | null;
  mode: string | null; prescription: WorkoutExercisePrescription | null; setLog: WorkoutSetLog[] | null;
};

function measurement(mode: string, exercise: WorkoutExercisePrescription, logs: WorkoutSetLog[], setNumber: number) {
  const matches = logs.filter(log => log.exerciseId === exercise.id && (log.exerciseMode ?? mode) === (exercise.mode ?? mode) && log.setNumber === setNumber);
  // Do not guess when a legacy log has ambiguous duplicate set references.
  if (matches.length !== 1 || setNumber > exercise.sets) return null;
  const log = matches[0], trackingType = exercise.trackingType ?? "repetitions";
  return { trackingType, completed: log.completed, weightKg: log.weightKg ?? null,
    reps: trackingType === "repetitions" ? log.reps ?? null : null,
    durationSeconds: trackingType === "duration" ? log.durationSeconds ?? null : null };
}
const difference = (current: number | null, previous: number | null) => current === null || previous === null
  ? null : Number((current - previous).toFixed(6)) || 0;

function completedSetCount(mode: string, exercise: WorkoutExercisePrescription, logs: WorkoutSetLog[]) {
  return Array.from({ length: exercise.sets }, (_, i) => measurement(mode, exercise, logs, i + 1))
    .filter(set => set?.completed).length;
}

export async function getWorkoutComparison(tx: DatabaseTransaction, userId: string, workout: ComparisonWorkout): Promise<WorkoutComparison> {
  const result: WorkoutComparison = { version: "1", basis: "previous_completed_workout", exercises: [] };
  if (workout.status !== "completed") return result;
  const references = workout.exerciseSnapshot.map(e => ({ id: e.id, mode: e.mode ?? workout.mode }))
    .filter((e): e is { id: string; mode: "gym" | "calisthenics" } => e.mode === "gym" || e.mode === "calisthenics");
  if (!references.length) return result;
  const startedAt = new Date(workout.startedAt).toISOString();
  // One query for at most 12 references. Reuse the account/finished_at index;
  // each exercise can have a different most recent session and program source.
  const previous = await tx.execute<Previous>(sql`
    SELECT wanted.id AS "exerciseId", wanted.mode AS "exerciseMode", prior.id,
      prior.started_at AS "startedAt", prior.finished_at AS "finishedAt", prior.recorded_on AS "recordedOn",
      prior.mode, prior.prescription, prior.set_log AS "setLog"
    FROM jsonb_to_recordset(${JSON.stringify(references)}::jsonb) AS wanted(id text, mode text)
    LEFT JOIN LATERAL (
      SELECT session.id, session.mode, session.started_at, session.finished_at, session.recorded_on,
        exercise.value AS prescription, session.set_log
      FROM workout_sessions AS session
      CROSS JOIN LATERAL jsonb_array_elements(session.exercise_snapshot) AS exercise(value)
      WHERE session.user_id = ${userId} AND session.id <> ${workout.id}
        AND session.status = 'completed' AND session.deleted_at IS NULL
        AND session.started_at < ${startedAt}::timestamptz
        AND session.finished_at <= ${startedAt}::timestamptz AND session.finished_at <= now()
        AND exercise.value->>'id' = wanted.id
        AND COALESCE(exercise.value->>'mode', session.mode::text) = wanted.mode
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(session.set_log) AS log(value)
          WHERE log.value->>'exerciseId' = wanted.id
            AND COALESCE(log.value->>'exerciseMode', session.mode::text) = wanted.mode
            AND log.value->>'completed' = 'true'
            AND (log.value->>'setNumber')::integer BETWEEN 1 AND (exercise.value->>'sets')::integer
        )
      ORDER BY session.finished_at DESC, session.started_at DESC, session.id DESC
      LIMIT 1
    ) AS prior ON true
  `);
  for (const reference of references) {
    const exercise = workout.exerciseSnapshot.find(e => e.id === reference.id && (e.mode ?? workout.mode) === reference.mode)!;
    const prior = previous.rows.find(p => p.exerciseId === reference.id && p.exerciseMode === reference.mode);
    const previousWorkout = prior?.id ? { id: prior.id, startedAt: new Date(prior.startedAt!).toISOString(),
      finishedAt: new Date(prior.finishedAt!).toISOString(), recordedOn: prior.recordedOn === null ? null :
        (prior.recordedOn instanceof Date ? prior.recordedOn.toISOString() : prior.recordedOn).slice(0, 10) } : null;
    const sets = Array.from({ length: exercise.sets }, (_, index) => {
      const setNumber = index + 1, current = measurement(workout.mode, exercise, workout.setLog, setNumber);
      const last = prior?.prescription ? measurement(prior.mode!, prior.prescription, prior.setLog ?? [], setNumber) : null;
      const comparable = current?.completed && last?.completed && current.trackingType === last.trackingType;
      return { setNumber, current, previous: last, delta: {
        weightKg: comparable ? difference(current.weightKg, last.weightKg) : null,
        reps: comparable ? difference(current.reps, last.reps) : null,
        durationSeconds: comparable ? difference(current.durationSeconds, last.durationSeconds) : null,
      } };
    });
    const currentCount = completedSetCount(workout.mode, exercise, workout.setLog);
    const previousCount = prior?.prescription ? completedSetCount(prior.mode!, prior.prescription, prior.setLog ?? []) : null;
    result.exercises.push({ exerciseId: reference.id, exerciseMode: reference.mode, previousWorkout,
      setCount: { current: currentCount, previous: previousCount, delta: previousCount === null ? null : currentCount - previousCount }, sets });
  }
  return result;
}
