-- Only workout storage gains mixed. Do not widen training_mode or rewrite
-- historical snapshots, receipts, versions, timestamps or profile preferences.
CREATE TYPE workout_mode AS ENUM ('gym', 'calisthenics', 'mixed');
--> statement-breakpoint
ALTER TABLE workout_sessions ALTER COLUMN mode TYPE workout_mode USING mode::text::workout_mode;
--> statement-breakpoint
ALTER TABLE workout_sessions ADD CONSTRAINT workout_sessions_mixed_manual CHECK (
  mode <> 'mixed' OR (status = 'completed' AND coalesce(legacy_metadata->>'source' = 'manual', false))
);
