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
    weekday: customPrograms.weekday, durationMinutes: customPrograms.durationMinutes,
    version: sql<string>`${customPrograms.version}::text`,
  }).from(customPrograms).where(and(eq(customPrograms.userId, userId), isNull(customPrograms.deletedAt), sql`${customPrograms.weekday} IS NOT NULL`))
    .orderBy(asc(customPrograms.weekday), asc(customPrograms.mode), asc(customPrograms.id));
}
async function workoutDays(tx: DatabaseTransaction, userId: string, from: string, to: string) {
  const result = await tx.execute<{ date: string; completed: number; aborted: number; active: number; durationMinutes: number }>(sql`
    SELECT recorded_on::text AS date, count(*) FILTER (WHERE status='completed')::integer AS completed,
      count(*) FILTER (WHERE status='aborted')::integer AS aborted, count(*) FILTER (WHERE status='active')::integer AS active,
      coalesce(sum(greatest(0, extract(epoch FROM finished_at-started_at)/60)) FILTER (WHERE status='completed'),0)::double precision AS "durationMinutes"
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
    const sets = await tx.execute<{ completedSets: number; reportedReps: number; reportedExternalVolumeKg: number; setsMissingLoad: number }>(sql`
      SELECT count(*)::integer AS "completedSets", coalesce(sum((entry->>'reps')::integer),0)::double precision AS "reportedReps",
        coalesce(sum((entry->>'reps')::numeric*(entry->>'weightKg')::numeric),0)::double precision AS "reportedExternalVolumeKg",
        count(*) FILTER (WHERE entry->>'weightKg' IS NULL)::integer AS "setsMissingLoad"
      FROM workout_sessions CROSS JOIN LATERAL jsonb_array_elements(set_log) AS entry
      WHERE user_id=${userId} AND deleted_at IS NULL AND status='completed' AND recorded_on BETWEEN ${query.from}::date AND ${query.to}::date
        AND entry->>'completed'='true'`);
    const meals = await tx.execute<{ date: string; entryCount: number; caloriesKcal: number; proteinGrams: number }>(sql`
      SELECT recorded_on::text AS date, count(*)::integer AS "entryCount",
        coalesce(sum(calories_kcal),0)::double precision AS "caloriesKcal", coalesce(sum(protein_grams),0)::double precision AS "proteinGrams"
      FROM meal_entries WHERE user_id=${userId} AND deleted_at IS NULL AND recorded_on BETWEEN ${query.from}::date AND ${query.to}::date
        AND NOT coalesce(snapshot->'nutritionDetails'->>'sourceType'='demo', false)
      GROUP BY recorded_on ORDER BY recorded_on`);
    return { ...query, workoutDays: days, mealDays: meals.rows,
      totals: { completedWorkouts: days.reduce((n, d) => n + d.completed, 0), abortedWorkouts: days.reduce((n, d) => n + d.aborted, 0),
        durationMinutes: Math.round(days.reduce((n, d) => n + d.durationMinutes, 0) * 100) / 100, ...sets.rows[0] },
      warnings: ["USER_REPORTED_NOT_INDEPENDENTLY_VERIFIED", "UNDATED_LEGACY_RECORDS_EXCLUDED", "VOLUME_COUNTS_REPORTED_EXTERNAL_LOAD_ONLY", "DEMO_MEALS_EXCLUDED"] };
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
