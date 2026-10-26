-- Additive metadata. Never backfill performed results or private snapshots.
ALTER TABLE exercise_catalog ADD COLUMN tracking_type text NOT NULL DEFAULT 'repetitions',
  ADD COLUMN default_duration_seconds integer, ADD COLUMN muscle_targets jsonb;
--> statement-breakpoint
ALTER TABLE exercise_catalog ALTER COLUMN default_reps DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE exercise_catalog ADD CONSTRAINT exercise_catalog_muscles_object CHECK (muscle_targets IS NULL OR jsonb_typeof(muscle_targets)='object');
--> statement-breakpoint
ALTER TABLE exercise_catalog ADD CONSTRAINT exercise_catalog_measurement CHECK (
  (tracking_type='repetitions' AND default_reps IS NOT NULL AND default_duration_seconds IS NULL) OR
  (tracking_type='duration' AND default_reps IS NULL AND default_duration_seconds BETWEEN 1 AND 3600 AND default_duration_seconds IS NOT NULL));
--> statement-breakpoint
ALTER TABLE user_exercises ADD COLUMN tracking_type text NOT NULL DEFAULT 'repetitions', ADD COLUMN default_duration_seconds integer;
--> statement-breakpoint
ALTER TABLE user_exercises ALTER COLUMN default_reps DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE user_exercises ADD CONSTRAINT user_exercises_measurement CHECK (
  (tracking_type='repetitions' AND default_reps IS NOT NULL AND default_duration_seconds IS NULL) OR
  (tracking_type='duration' AND default_reps IS NULL AND default_duration_seconds BETWEEN 1 AND 3600 AND default_duration_seconds IS NOT NULL));
--> statement-breakpoint
ALTER TABLE workout_program_exercises ALTER COLUMN reps DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE workout_program_exercises ADD COLUMN target_duration_seconds integer;
--> statement-breakpoint
ALTER TABLE workout_program_exercises ADD CONSTRAINT program_exercises_measurement CHECK (
  (reps IS NOT NULL AND target_duration_seconds IS NULL) OR
  (reps IS NULL AND target_duration_seconds BETWEEN 1 AND 3600 AND target_duration_seconds IS NOT NULL));
--> statement-breakpoint
ALTER TABLE workout_sessions ADD COLUMN result_metrics jsonb;
--> statement-breakpoint
ALTER TABLE workout_sessions ADD CONSTRAINT workout_sessions_metrics_object CHECK (result_metrics IS NULL OR jsonb_typeof(result_metrics)='object');
--> statement-breakpoint
-- Explicit product-authored anatomical target groups, not activation measures.
-- No name matching or reuse of movement restrictions/profile focus at runtime.
UPDATE exercise_catalog SET muscle_targets=jsonb_build_object('version','1','primary',ARRAY['chest'],'secondary',ARRAY['shoulders','triceps'])
WHERE id IN ('bench_press','press','barbell_floor_press','decline_barbell_bench_press','incline_barbell_bench_press','paused_barbell_bench_press','flat_dumbbell_bench_press','incline_dumbbell_press','decline_dumbbell_bench_press','neutral_grip_dumbbell_bench_press','dumbbell_squeeze_press','single_arm_dumbbell_bench_press','alternating_dumbbell_bench_press','standing_cable_chest_press','single_arm_cable_chest_press','flat_bench_cable_chest_press','incline_bench_cable_chest_press','seated_chest_press_machine','incline_chest_press_machine','decline_chest_press_machine','smith_machine_bench_press','smith_machine_incline_bench_press','smith_machine_decline_bench_press','pushup','knee_pushup','incline_pushup','decline_pushup','wide_pushup','wall_pushup');
--> statement-breakpoint
UPDATE exercise_catalog SET muscle_targets=jsonb_build_object('version','1','primary',ARRAY['chest'],'secondary',ARRAY['shoulders'])
WHERE id IN ('dumbbell_fly','incline_dumbbell_fly','decline_dumbbell_fly','dumbbell_floor_fly','standing_cable_fly','high_to_low_cable_fly','low_to_high_cable_fly','flat_bench_cable_fly','incline_bench_cable_fly','pec_deck_butterfly_machine');
--> statement-breakpoint
UPDATE exercise_catalog SET muscle_targets=jsonb_build_object('version','1','primary',ARRAY['upperBack','lats'],'secondary',ARRAY['biceps','shoulders'])
WHERE id IN ('row','barbell_row','underhand_barbell_row','pendlay_row','t_bar_row','meadows_row','landmine_single_arm_row','barbell_seal_row','bent_over_dumbbell_row','chest_supported_dumbbell_row','incline_bench_dumbbell_row','dumbbell_seal_row','dumbbell_renegade_row','seated_cable_row','wide_grip_seated_cable_row','underhand_seated_cable_row','single_arm_cable_row','standing_cable_row','chest_supported_row_machine','high_row_machine','low_row_machine','iso_lateral_row_machine','inverted_row','ring_row');
--> statement-breakpoint
UPDATE exercise_catalog SET muscle_targets=jsonb_build_object('version','1','primary',ARRAY['lats'],'secondary',ARRAY['biceps','upperBack'])
WHERE id IN ('pullup','chinup','band_assisted_pullup','assisted_pull_up_machine','lat_pulldown','wide_grip_lat_pulldown','close_grip_lat_pulldown','neutral_grip_lat_pulldown','reverse_grip_lat_pulldown','single_arm_lat_pulldown');
--> statement-breakpoint
UPDATE exercise_catalog SET muscle_targets=jsonb_build_object('version','1','primary',ARRAY['lats'],'secondary',ARRAY['chest'])
WHERE id IN ('barbell_pullover','dumbbell_pullover','pullover_machine','straight_arm_cable_pulldown');
--> statement-breakpoint
UPDATE exercise_catalog SET muscle_targets=jsonb_build_object('version','1','primary',ARRAY['quadriceps','glutes'],'secondary',ARRAY['hamstrings'])
WHERE id IN ('squat','back_squat','front_squat','lunge','supported_reverse_lunge','chair_sit_to_stand','bulgarian_split_squat','split_squat','step_up','leg_press');
--> statement-breakpoint
UPDATE exercise_catalog SET muscle_targets=jsonb_build_object('version','1','primary',ARRAY['hamstrings','glutes'],'secondary',ARRAY['lowerBack']) WHERE id IN ('deadlift','romanian_deadlift');
--> statement-breakpoint
UPDATE exercise_catalog SET muscle_targets=jsonb_build_object('version','1','primary',ARRAY['glutes'],'secondary',ARRAY['hamstrings']) WHERE id IN ('hip_thrust','bridge','single_leg_bridge');
--> statement-breakpoint
UPDATE exercise_catalog SET muscle_targets=jsonb_build_object('version','1','primary',ARRAY['calves'],'secondary','[]'::jsonb) WHERE id IN ('calf_raise','bodyweight_calf_raise');
--> statement-breakpoint
UPDATE exercise_catalog SET muscle_targets=jsonb_build_object('version','1','primary',ARRAY['quadriceps'],'secondary','[]'::jsonb) WHERE id='leg_extension';
--> statement-breakpoint
UPDATE exercise_catalog SET muscle_targets=jsonb_build_object('version','1','primary',ARRAY['hamstrings'],'secondary','[]'::jsonb) WHERE id='leg_curl';
--> statement-breakpoint
UPDATE exercise_catalog SET muscle_targets=jsonb_build_object('version','1','primary',ARRAY['shoulders'],'secondary',ARRAY['triceps']) WHERE id IN ('overhead_press','dumbbell_shoulder_press','pike_pushup');
--> statement-breakpoint
UPDATE exercise_catalog SET muscle_targets=jsonb_build_object('version','1','primary',ARRAY['shoulders'],'secondary','[]'::jsonb) WHERE id='raise';
--> statement-breakpoint
UPDATE exercise_catalog SET muscle_targets=jsonb_build_object('version','1','primary',ARRAY['shoulders','upperBack'],'secondary','[]'::jsonb) WHERE id='face_pull';
--> statement-breakpoint
UPDATE exercise_catalog SET muscle_targets=jsonb_build_object('version','1','primary',ARRAY['biceps'],'secondary',ARRAY['forearms']) WHERE id IN ('curl','hammer_curl');
--> statement-breakpoint
UPDATE exercise_catalog SET muscle_targets=jsonb_build_object('version','1','primary',ARRAY['triceps'],'secondary',ARRAY['chest','shoulders']) WHERE id IN ('diamond','dips');
--> statement-breakpoint
UPDATE exercise_catalog SET muscle_targets=jsonb_build_object('version','1','primary',ARRAY['triceps'],'secondary','[]'::jsonb) WHERE id='triceps_extension';
--> statement-breakpoint
UPDATE exercise_catalog SET muscle_targets=jsonb_build_object('version','1','primary',ARRAY['abs'],'secondary',ARRAY['obliques']) WHERE id IN ('crunch','reverse_crunch','lying_leg_raise','dead_bug','mountain_climber');
--> statement-breakpoint
UPDATE exercise_catalog SET muscle_targets=jsonb_build_object('version','1','primary',ARRAY['abs','lowerBack'],'secondary',ARRAY['glutes']) WHERE id='bird_dog';
--> statement-breakpoint
-- New explicitly timed entries; no existing movement changes measurement kind.
-- 30s is a selectable catalog target, not a claimed result or medical prescription.
INSERT INTO exercise_catalog(id,mode,id_label,en_label,default_sets,default_reps,requirements,movement_tags,tracking_type,default_duration_seconds,muscle_targets)
SELECT 'plank',mode::training_mode,'Plank lengan bawah','Forearm plank',1,NULL,'[[]]'::jsonb,
  ARRAY['shoulder','elbow','back','hip','floor_transfer'],'duration',30,
  jsonb_build_object('version','1','primary',ARRAY['abs'],'secondary',ARRAY['obliques','lowerBack'])
FROM unnest(ARRAY['gym','calisthenics']) mode;
--> statement-breakpoint
