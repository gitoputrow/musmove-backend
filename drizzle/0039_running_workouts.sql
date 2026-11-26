-- Running is a workout-only session kind. Do not widen training_mode or rewrite
-- historical snapshots, logs, receipts, versions or timestamps. Constraints
-- compare mode::text so they never use the new enum label inside the same
-- migration transaction that adds it.
ALTER TYPE workout_mode ADD VALUE IF NOT EXISTS 'running';
--> statement-breakpoint
ALTER TABLE workout_sessions ADD COLUMN run_log jsonb;
--> statement-breakpoint
ALTER TABLE workout_sessions DROP CONSTRAINT IF EXISTS workout_sessions_exercise_count;
--> statement-breakpoint
ALTER TABLE workout_sessions ADD CONSTRAINT workout_sessions_exercise_count CHECK (
  jsonb_typeof(exercise_snapshot) = 'array'
  AND ((mode::text = 'running' AND jsonb_array_length(exercise_snapshot) = 0)
    OR (mode::text <> 'running' AND jsonb_array_length(exercise_snapshot) BETWEEN 1 AND 12))
);
--> statement-breakpoint
ALTER TABLE workout_sessions ADD CONSTRAINT workout_sessions_running_shape CHECK (
  (mode::text <> 'running' AND run_log IS NULL)
  OR (mode::text = 'running' AND status = 'completed'
    AND coalesce(legacy_metadata->>'source' = 'run', false)
    AND run_log IS NOT NULL AND jsonb_typeof(run_log) = 'object' AND jsonb_array_length(set_log) = 0
    AND octet_length(run_log::text) <= 262144)
);
