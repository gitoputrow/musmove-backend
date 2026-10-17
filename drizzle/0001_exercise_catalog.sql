CREATE TABLE exercise_catalog (
  id varchar(255) NOT NULL,
  mode training_mode NOT NULL,
  id_label varchar(80) NOT NULL,
  en_label varchar(80) NOT NULL,
  default_sets smallint NOT NULL CHECK (default_sets BETWEEN 1 AND 10),
  default_reps smallint NOT NULL CHECK (default_reps BETWEEN 1 AND 100),
  requirements jsonb NOT NULL CHECK (jsonb_typeof(requirements) = 'array' AND jsonb_array_length(requirements) > 0),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mode, id)
);
--> statement-breakpoint
CREATE TABLE catalog_state (
  name varchar(80) PRIMARY KEY,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
--> statement-breakpoint
INSERT INTO catalog_state (name, version) VALUES ('exercises', 2);
--> statement-breakpoint
INSERT INTO exercise_catalog (id, mode, id_label, en_label, default_sets, default_reps, requirements) VALUES
('press', 'gym', 'Dumbbell floor press', 'Dumbbell floor press', 3, 10, '[["dumbbell"]]'::jsonb),
('row', 'gym', 'Dumbbell row', 'Dumbbell row', 3, 12, '[["dumbbell"]]'::jsonb),
('squat', 'gym', 'Goblet squat', 'Goblet squat', 3, 12, '[["dumbbell"]]'::jsonb),
('curl', 'gym', 'Dumbbell curl', 'Dumbbell curl', 3, 12, '[["dumbbell"]]'::jsonb),
('raise', 'gym', 'Lateral raise', 'Lateral raise', 3, 10, '[["dumbbell"]]'::jsonb),
('lunge', 'gym', 'Reverse lunge', 'Reverse lunge', 2, 10, '[[]]'::jsonb),
('pushup', 'calisthenics', 'Push-up', 'Push-up', 3, 8, '[[]]'::jsonb),
('squat', 'calisthenics', 'Bodyweight squat', 'Bodyweight squat', 3, 12, '[[]]'::jsonb),
('lunge', 'calisthenics', 'Reverse lunge', 'Reverse lunge', 2, 10, '[[]]'::jsonb),
('bridge', 'calisthenics', 'Glute bridge', 'Glute bridge', 3, 12, '[[]]'::jsonb),
('pullup', 'calisthenics', 'Pull-up', 'Pull-up', 2, 6, '[["pull_up_bar"]]'::jsonb),
('diamond', 'calisthenics', 'Diamond push-up', 'Diamond push-up', 2, 6, '[[]]'::jsonb),
('bench_press', 'gym', 'Bench press barbel', 'Barbell bench press', 3, 10, '[["barbell","bench"]]'::jsonb),
('incline_dumbbell_press', 'gym', 'Press dumbbell incline', 'Incline dumbbell press', 3, 10, '[["dumbbell","bench"]]'::jsonb),
('dumbbell_fly', 'gym', 'Fly dumbbell', 'Dumbbell fly', 3, 10, '[["dumbbell","bench"]]'::jsonb),
('overhead_press', 'gym', 'Press bahu barbel', 'Barbell overhead press', 3, 10, '[["barbell"]]'::jsonb),
('dumbbell_shoulder_press', 'gym', 'Press bahu dumbbell', 'Dumbbell shoulder press', 3, 10, '[["dumbbell"]]'::jsonb),
('triceps_extension', 'gym', 'Ekstensi trisep dumbbell', 'Dumbbell triceps extension', 3, 10, '[["dumbbell"]]'::jsonb),
('hammer_curl', 'gym', 'Hammer curl', 'Hammer curl', 3, 10, '[["dumbbell"]]'::jsonb),
('barbell_row', 'gym', 'Row barbel', 'Barbell row', 3, 10, '[["barbell"]]'::jsonb),
('lat_pulldown', 'gym', 'Lat pulldown', 'Lat pulldown', 3, 10, '[["lat_pulldown_machine"]]'::jsonb),
('seated_cable_row', 'gym', 'Row kabel duduk', 'Seated cable row', 3, 10, '[["cable_machine"]]'::jsonb),
('face_pull', 'gym', 'Face pull', 'Face pull', 3, 10, '[["cable_machine"]]'::jsonb),
('back_squat', 'gym', 'Squat barbel belakang', 'Barbell back squat', 3, 10, '[["barbell","squat_rack"]]'::jsonb),
('front_squat', 'gym', 'Squat barbel depan', 'Barbell front squat', 3, 10, '[["barbell","squat_rack"]]'::jsonb),
('romanian_deadlift', 'gym', 'Deadlift Romania', 'Romanian deadlift', 3, 10, '[["barbell"]]'::jsonb),
('deadlift', 'gym', 'Deadlift barbel', 'Barbell deadlift', 3, 10, '[["barbell"]]'::jsonb),
('leg_press', 'gym', 'Leg press', 'Leg press', 3, 10, '[["leg_press_machine"]]'::jsonb),
('leg_curl', 'gym', 'Curl paha', 'Leg curl', 3, 10, '[["leg_curl_machine"]]'::jsonb),
('leg_extension', 'gym', 'Ekstensi paha', 'Leg extension', 3, 10, '[["leg_extension_machine"]]'::jsonb),
('hip_thrust', 'gym', 'Hip thrust barbel', 'Barbell hip thrust', 3, 10, '[["barbell","bench"]]'::jsonb),
('calf_raise', 'gym', 'Angkat tumit dumbbell', 'Dumbbell calf raise', 3, 10, '[["dumbbell"]]'::jsonb),
('bulgarian_split_squat', 'gym', 'Split squat Bulgaria', 'Bulgarian split squat', 3, 10, '[["dumbbell","bench"]]'::jsonb),
('incline_pushup', 'calisthenics', 'Push-up incline', 'Incline push-up', 3, 10, '[["bench"]]'::jsonb),
('decline_pushup', 'calisthenics', 'Push-up decline', 'Decline push-up', 3, 10, '[["bench"]]'::jsonb),
('wide_pushup', 'calisthenics', 'Push-up tangan lebar', 'Wide push-up', 3, 10, '[[]]'::jsonb),
('pike_pushup', 'calisthenics', 'Pike push-up', 'Pike push-up', 3, 10, '[[]]'::jsonb),
('chinup', 'calisthenics', 'Chin-up', 'Chin-up', 3, 10, '[["pull_up_bar"]]'::jsonb),
('inverted_row', 'calisthenics', 'Row terbalik', 'Inverted row', 3, 10, '[["low_bar"]]'::jsonb),
('ring_row', 'calisthenics', 'Row ring', 'Ring row', 3, 10, '[["rings"]]'::jsonb),
('dips', 'calisthenics', 'Dip palang paralel', 'Parallel bar dip', 3, 10, '[["parallel_bars"]]'::jsonb),
('split_squat', 'calisthenics', 'Split squat', 'Split squat', 3, 10, '[[]]'::jsonb),
('single_leg_bridge', 'calisthenics', 'Bridge satu kaki', 'Single-leg glute bridge', 3, 10, '[[]]'::jsonb),
('bodyweight_calf_raise', 'calisthenics', 'Angkat tumit tanpa beban', 'Bodyweight calf raise', 3, 10, '[[]]'::jsonb),
('crunch', 'calisthenics', 'Crunch', 'Crunch', 3, 10, '[[]]'::jsonb),
('reverse_crunch', 'calisthenics', 'Crunch terbalik', 'Reverse crunch', 3, 10, '[[]]'::jsonb),
('lying_leg_raise', 'calisthenics', 'Angkat kaki berbaring', 'Lying leg raise', 3, 10, '[[]]'::jsonb),
('dead_bug', 'calisthenics', 'Dead bug', 'Dead bug', 3, 10, '[[]]'::jsonb),
('bird_dog', 'calisthenics', 'Bird dog', 'Bird dog', 3, 10, '[[]]'::jsonb),
('mountain_climber', 'calisthenics', 'Mountain climber', 'Mountain climber', 3, 10, '[[]]'::jsonb),
('step_up', 'calisthenics', 'Naik bangku', 'Step-up', 3, 10, '[["bench"]]'::jsonb);
--> statement-breakpoint
CREATE FUNCTION bump_exercise_catalog_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE catalog_state SET version = version + 1 WHERE name = 'exercises';
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER exercise_catalog_version_changed
AFTER INSERT OR UPDATE OR DELETE ON exercise_catalog
FOR EACH STATEMENT EXECUTE FUNCTION bump_exercise_catalog_version();

