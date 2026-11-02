-- Allow 'record' alongside 'manual' in workout_sessions_mixed_manual constraint,
-- and update existing 'manual' references to 'record'.
ALTER TABLE workout_sessions DROP CONSTRAINT IF EXISTS workout_sessions_mixed_manual;
--> statement-breakpoint
ALTER TABLE workout_sessions ADD CONSTRAINT workout_sessions_mixed_manual CHECK (
  mode <> 'mixed' OR (status = 'completed' AND coalesce(legacy_metadata->>'source' IN ('manual', 'record'), false))
);
--> statement-breakpoint
UPDATE workout_sessions SET plan_id = 'record' WHERE plan_id = 'manual';
--> statement-breakpoint
UPDATE workout_sessions
SET legacy_metadata = jsonb_set(legacy_metadata, '{source}', '"record"')
WHERE legacy_metadata->>'source' = 'manual';
