ALTER TABLE profiles ADD COLUMN training_level varchar(20)
 CHECK (training_level IS NULL OR training_level IN ('beginner','intermediate','advanced'));
--> statement-breakpoint
ALTER TABLE profiles ADD COLUMN exercise_capabilities jsonb
 CHECK (exercise_capabilities IS NULL OR jsonb_typeof(exercise_capabilities) = 'array');
--> statement-breakpoint
ALTER TABLE profiles ADD COLUMN excluded_exercise_ids text[];
--> statement-breakpoint
INSERT INTO exercise_catalog (id, mode, id_label, en_label, default_sets, default_reps, requirements)
VALUES ('wall_pushup','calisthenics','Push-up dinding','Wall push-up',2,8,'[[]]'),
       ('knee_pushup','calisthenics','Push-up lutut','Knee push-up',2,8,'[[]]'),
       ('band_assisted_pullup','calisthenics','Pull-up dibantu resistance band','Band-assisted pull-up',2,6,'[["pull_up_bar","resistance_band"]]')
ON CONFLICT (mode,id) DO NOTHING;
