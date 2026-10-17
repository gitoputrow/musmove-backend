ALTER TABLE profiles ADD COLUMN gender varchar(30)
 CONSTRAINT profiles_gender CHECK (gender IS NULL OR gender IN ('male','female','non_binary','self_described','prefer_not_to_say'));
--> statement-breakpoint
ALTER TABLE profiles ADD COLUMN training_context jsonb
 CONSTRAINT profiles_training_context CHECK (training_context IS NULL OR jsonb_typeof(training_context) = 'object');
--> statement-breakpoint
ALTER TABLE exercise_catalog ADD COLUMN movement_tags text[];
--> statement-breakpoint
INSERT INTO exercise_catalog (id,mode,id_label,en_label,default_sets,default_reps,requirements,movement_tags)
VALUES
('chair_sit_to_stand','calisthenics','Duduk-berdiri dari kursi','Chair sit-to-stand',2,8,'[["chair"]]','{hip,knee,ankle,back}'),
('supported_reverse_lunge','calisthenics','Reverse lunge dengan pegangan','Supported reverse lunge',2,8,'[["chair"]]','{hip,knee,ankle,deep_knee_bend}'),
('chair_sit_to_stand','gym','Duduk-berdiri dari kursi','Chair sit-to-stand',2,8,'[["chair"]]','{hip,knee,ankle,back}'),
('supported_reverse_lunge','gym','Reverse lunge dengan pegangan','Supported reverse lunge',2,8,'[["chair"]]','{hip,knee,ankle,deep_knee_bend}')
ON CONFLICT (mode,id) DO NOTHING;
--> statement-breakpoint
-- Annotate the curated template exercises and regressions. NULL for unreviewed
-- catalog entries prevents them bypassing a user's explicit movement filters.
UPDATE exercise_catalog SET movement_tags = CASE
 WHEN id IN ('press','pushup','diamond') THEN ARRAY['shoulder','elbow','wrist','floor_transfer']
 WHEN id = 'knee_pushup' THEN ARRAY['shoulder','elbow','wrist','knee','floor_transfer']
 WHEN id = 'wall_pushup' THEN ARRAY['shoulder','elbow','wrist']
 WHEN id = 'row' THEN ARRAY['shoulder','elbow','wrist','back','balance_challenge']
 WHEN id = 'squat' THEN ARRAY['hip','knee','ankle','back','balance_challenge','deep_knee_bend']
 WHEN id = 'lunge' THEN ARRAY['hip','knee','ankle','balance_challenge','deep_knee_bend']
 WHEN id = 'curl' THEN ARRAY['elbow','wrist']
 WHEN id = 'raise' THEN ARRAY['shoulder','wrist','overhead_reach']
 WHEN id = 'dead_bug' THEN ARRAY['hip','back','floor_transfer']
 WHEN id = 'bridge' THEN ARRAY['hip','back','floor_transfer']
 WHEN id = 'bird_dog' THEN ARRAY['shoulder','wrist','hip','back','knee','floor_transfer']
 WHEN id IN ('pullup','band_assisted_pullup') THEN ARRAY['shoulder','elbow','wrist','overhead_reach']
 ELSE movement_tags END
 WHERE id IN ('press','pushup','diamond','knee_pushup','wall_pushup','row','squat','lunge','curl','raise','dead_bug','bridge','bird_dog','pullup','band_assisted_pullup');

