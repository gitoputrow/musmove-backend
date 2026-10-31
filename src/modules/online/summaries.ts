import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { z } from "zod";
import { customPrograms } from "@/src/db/schema";
import type { DatabaseTransaction } from "@/src/modules/sync/entities";
import { readAccountSetup } from "@/src/modules/onboarding/service";
import { readMeals } from "@/src/modules/meals/service";
import { readOnline } from "./store";
import { summaryQuerySchema } from "./dto";

async function weeklySchedule(tx: DatabaseTransaction, userId: string) {
  return tx.select({ id: customPrograms.id, mode: customPrograms.mode, name: customPrograms.name,
    weekday: customPrograms.weekday,
    version: sql<string>`${customPrograms.version}::text`,
  }).from(customPrograms).where(and(eq(customPrograms.userId, userId), isNull(customPrograms.deletedAt), sql`${customPrograms.weekday} IS NOT NULL`))
    .orderBy(asc(customPrograms.weekday), asc(customPrograms.mode), asc(customPrograms.id));
}
async function workoutDays(tx: DatabaseTransaction, userId: string, from: string, to: string) {
  const result = await tx.execute<{ date: string; completed: number; aborted: number; active: number; durationMinutes: number | null; knownDurationMinutes: number; workoutsMissingDuration: number }>(sql`
    SELECT recorded_on::text AS date, count(*) FILTER (WHERE status='completed')::integer AS completed,
      count(*) FILTER (WHERE status='aborted')::integer AS aborted, count(*) FILTER (WHERE status='active')::integer AS active,
      CASE WHEN count(*) FILTER (WHERE status='completed' AND result_metrics->'duration'->>'seconds' IS NULL)>0 THEN NULL
        ELSE coalesce(sum((result_metrics->'duration'->>'seconds')::numeric) FILTER (WHERE status='completed'),0)/60 END::double precision AS "durationMinutes",
      (coalesce(sum((result_metrics->'duration'->>'seconds')::numeric) FILTER (WHERE status='completed'),0)/60)::double precision AS "knownDurationMinutes",
      count(*) FILTER (WHERE status='completed' AND result_metrics->'duration'->>'seconds' IS NULL)::integer AS "workoutsMissingDuration"
    FROM workout_sessions WHERE user_id=${userId} AND deleted_at IS NULL AND recorded_on BETWEEN ${from}::date AND ${to}::date
    GROUP BY recorded_on ORDER BY recorded_on`);
  return result.rows;
}
export function schedule(userId: string, query: z.infer<typeof summaryQuerySchema>) {
  return readOnline(userId, async tx => ({ from: query.from, to: query.to, weekdayConvention: "ISO_MONDAY_1_SUNDAY_7",
    weeklyPrograms: await weeklySchedule(tx, userId), workoutDays: await workoutDays(tx, userId, query.from, query.to) }));
}
export function statistics(userId: string, query: z.infer<typeof summaryQuerySchema>) {
  return readOnline(userId, async tx => {
    const days = await workoutDays(tx, userId, query.from, query.to);
    const sets = await tx.execute<{ completedSets: number; reportedReps: number | null; reportedExternalVolumeKg: number | null; totalHoldSeconds: number | null; setsMissingLoad: number; setsMissingReps: number; setsMissingDuration: number; unmatchedCompletedSets: number; repetitionSets: number; durationSets: number }>(sql`
      WITH logs AS (
        SELECT entry, s.exercise, coalesce(s.exercise->>'trackingType','repetitions') AS kind
        FROM workout_sessions w CROSS JOIN LATERAL jsonb_array_elements(w.set_log) AS entry
        LEFT JOIN LATERAL (
          SELECT e AS exercise FROM jsonb_array_elements(w.exercise_snapshot) e
          WHERE e->>'id'=entry->>'exerciseId' AND coalesce(e->>'mode',w.mode::text)=coalesce(entry->>'exerciseMode',w.mode::text)
            AND (entry->>'setNumber')::integer BETWEEN 1 AND (e->>'sets')::integer LIMIT 1
        ) s ON true
        WHERE user_id=${userId} AND deleted_at IS NULL AND status='completed' AND recorded_on BETWEEN ${query.from}::date AND ${query.to}::date AND entry->>'completed'='true'
      ) SELECT count(*) FILTER (WHERE exercise IS NOT NULL)::integer AS "completedSets",
        CASE WHEN count(*) FILTER (WHERE exercise IS NULL OR (kind='repetitions' AND entry->>'reps' IS NULL))>0 THEN NULL
          ELSE coalesce(sum((entry->>'reps')::numeric) FILTER (WHERE kind='repetitions'),0) END::double precision AS "reportedReps",
        CASE WHEN count(*) FILTER (WHERE exercise IS NULL OR (kind='repetitions' AND (entry->>'reps' IS NULL OR entry->>'weightKg' IS NULL)))>0 THEN NULL
          ELSE coalesce(sum((entry->>'reps')::numeric*(entry->>'weightKg')::numeric) FILTER (WHERE kind='repetitions'),0) END::double precision AS "reportedExternalVolumeKg",
        CASE WHEN count(*) FILTER (WHERE exercise IS NULL OR (kind='duration' AND entry->>'durationSeconds' IS NULL))>0 THEN NULL
          ELSE coalesce(sum((entry->>'durationSeconds')::numeric) FILTER (WHERE kind='duration'),0) END::double precision AS "totalHoldSeconds",
        count(*) FILTER (WHERE exercise IS NOT NULL AND kind='repetitions' AND entry->>'weightKg' IS NULL)::integer AS "setsMissingLoad",
        count(*) FILTER (WHERE exercise IS NOT NULL AND kind='repetitions' AND entry->>'reps' IS NULL)::integer AS "setsMissingReps",
        count(*) FILTER (WHERE exercise IS NOT NULL AND kind='duration' AND entry->>'durationSeconds' IS NULL)::integer AS "setsMissingDuration",
        count(*) FILTER (WHERE exercise IS NULL)::integer AS "unmatchedCompletedSets",
        count(*) FILTER (WHERE exercise IS NOT NULL AND kind='repetitions')::integer AS "repetitionSets",
        count(*) FILTER (WHERE exercise IS NOT NULL AND kind='duration')::integer AS "durationSets" FROM logs`);
    const meals = await tx.execute<{ date: string; entryCount: number; caloriesKcal: number; proteinGrams: number }>(sql`
      SELECT recorded_on::text AS date, count(*)::integer AS "entryCount",
        coalesce(sum(calories_kcal),0)::double precision AS "caloriesKcal", coalesce(sum(protein_grams),0)::double precision AS "proteinGrams"
      FROM meal_entries WHERE user_id=${userId} AND deleted_at IS NULL AND recorded_on BETWEEN ${query.from}::date AND ${query.to}::date
        AND NOT coalesce(snapshot->'nutritionDetails'->>'sourceType'='demo', false)
      GROUP BY recorded_on ORDER BY recorded_on`);
    return { ...query, workoutDays: days, mealDays: meals.rows,
      totals: { completedWorkouts: days.reduce((n, d) => n + d.completed, 0), abortedWorkouts: days.reduce((n, d) => n + d.aborted, 0),
        durationMinutes: days.some(d => d.durationMinutes === null) ? null : Math.round(days.reduce((n, d) => n + (d.durationMinutes ?? 0), 0) * 100) / 100,
        knownDurationMinutes: Math.round(days.reduce((n, d) => n + d.knownDurationMinutes, 0) * 100) / 100,
        workoutsMissingDuration: days.reduce((n, d) => n + d.workoutsMissingDuration, 0), ...sets.rows[0] },
      warnings: ["USER_REPORTED_NOT_INDEPENDENTLY_VERIFIED", "UNDATED_LEGACY_RECORDS_EXCLUDED", "VOLUME_COUNTS_REPORTED_EXTERNAL_LOAD_ONLY", "UNKNOWN_RESULTS_ARE_NOT_ZERO", "HOLD_TIME_IS_NOT_SESSION_DURATION", "DEMO_MEALS_EXCLUDED"] };
  });
}
export function dashboard(userId: string, date: string) {
  return readOnline(userId, async tx => {
    const setup = await readAccountSetup(tx, userId);
    const weekday = ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const meals = await readMeals(tx, userId, { date, limit: 1, offset: 0 });
    return { date, setupCompleted: setup.setupCompleted,
      scheduledPrograms: (await weeklySchedule(tx, userId)).filter(p => p.weekday === weekday),
      workoutDays: await workoutDays(tx, userId, date, date),
      meals: { summary: { ...meals.summary, remaining: setup.setupCompleted ? meals.summary.remaining : null }, warnings: meals.warnings },
      nutritionTargets: setup.setupCompleted ? meals.targets : null,
    };
  });
}
