-- Reviewed exercise names: movement followed by the primary equipment in parentheses.
-- Preserve stable (mode,id), requirements, defaults, muscles, movement tags and active flags.
-- Never rewrite account exercises, saved programs, workout snapshots, logs or receipts.
DO $label_migration$
DECLARE
  labels jsonb := $exercise_labels$
[
  {
    "mode": "calisthenics",
    "id": "band_assisted_pullup",
    "requirements": [
      [
        "pull_up_bar",
        "resistance_band"
      ]
    ],
    "previous_id_label": "Pull-up dibantu resistance band",
    "previous_en_label": "Band-assisted pull-up",
    "id_label": "Pull-Up Berbantuan (Palang Pull-Up + Resistance Band)",
    "en_label": "Assisted Pull-Up (Pull-Up Bar + Resistance Band)"
  },
  {
    "mode": "calisthenics",
    "id": "bird_dog",
    "requirements": [
      []
    ],
    "previous_id_label": "Bird dog",
    "previous_en_label": "Bird dog",
    "id_label": "Bird Dog (Tanpa Alat)",
    "en_label": "Bird Dog (No Equipment)"
  },
  {
    "mode": "calisthenics",
    "id": "bodyweight_calf_raise",
    "requirements": [
      []
    ],
    "previous_id_label": "Angkat tumit tanpa beban",
    "previous_en_label": "Bodyweight calf raise",
    "id_label": "Angkat Tumit (Tanpa Alat)",
    "en_label": "Calf Raise (No Equipment)"
  },
  {
    "mode": "calisthenics",
    "id": "bridge",
    "requirements": [
      []
    ],
    "previous_id_label": "Glute bridge",
    "previous_en_label": "Glute bridge",
    "id_label": "Glute Bridge (Tanpa Alat)",
    "en_label": "Glute Bridge (No Equipment)"
  },
  {
    "mode": "calisthenics",
    "id": "chair_sit_to_stand",
    "requirements": [
      [
        "chair"
      ]
    ],
    "previous_id_label": "Duduk-berdiri dari kursi",
    "previous_en_label": "Chair sit-to-stand",
    "id_label": "Duduk-Berdiri (Kursi)",
    "en_label": "Sit-to-Stand (Chair)"
  },
  {
    "mode": "calisthenics",
    "id": "chinup",
    "requirements": [
      [
        "pull_up_bar"
      ]
    ],
    "previous_id_label": "Chin-up",
    "previous_en_label": "Chin-up",
    "id_label": "Chin-Up (Palang Pull-Up)",
    "en_label": "Chin-Up (Pull-Up Bar)"
  },
  {
    "mode": "calisthenics",
    "id": "crunch",
    "requirements": [
      []
    ],
    "previous_id_label": "Crunch",
    "previous_en_label": "Crunch",
    "id_label": "Crunch (Tanpa Alat)",
    "en_label": "Crunch (No Equipment)"
  },
  {
    "mode": "calisthenics",
    "id": "dead_bug",
    "requirements": [
      []
    ],
    "previous_id_label": "Dead bug",
    "previous_en_label": "Dead bug",
    "id_label": "Dead Bug (Tanpa Alat)",
    "en_label": "Dead Bug (No Equipment)"
  },
  {
    "mode": "calisthenics",
    "id": "decline_pushup",
    "requirements": [
      [
        "bench"
      ]
    ],
    "previous_id_label": "Push-up decline",
    "previous_en_label": "Decline push-up",
    "id_label": "Push-Up Decline (Bangku)",
    "en_label": "Decline Push-Up (Bench)"
  },
  {
    "mode": "calisthenics",
    "id": "diamond",
    "requirements": [
      []
    ],
    "previous_id_label": "Diamond push-up",
    "previous_en_label": "Diamond push-up",
    "id_label": "Diamond Push-Up (Tanpa Alat)",
    "en_label": "Diamond Push-Up (No Equipment)"
  },
  {
    "mode": "calisthenics",
    "id": "dips",
    "requirements": [
      [
        "parallel_bars"
      ]
    ],
    "previous_id_label": "Dip palang paralel",
    "previous_en_label": "Parallel bar dip",
    "id_label": "Dip (Palang Paralel)",
    "en_label": "Dip (Parallel Bars)"
  },
  {
    "mode": "calisthenics",
    "id": "incline_pushup",
    "requirements": [
      [
        "bench"
      ]
    ],
    "previous_id_label": "Push-up incline",
    "previous_en_label": "Incline push-up",
    "id_label": "Push-Up Incline (Bangku)",
    "en_label": "Incline Push-Up (Bench)"
  },
  {
    "mode": "calisthenics",
    "id": "inverted_row",
    "requirements": [
      [
        "low_bar"
      ]
    ],
    "previous_id_label": "Row terbalik",
    "previous_en_label": "Inverted row",
    "id_label": "Row Terbalik (Palang Rendah)",
    "en_label": "Inverted Row (Low Bar)"
  },
  {
    "mode": "calisthenics",
    "id": "knee_pushup",
    "requirements": [
      []
    ],
    "previous_id_label": "Push-up lutut",
    "previous_en_label": "Knee push-up",
    "id_label": "Push-Up Lutut (Tanpa Alat)",
    "en_label": "Knee Push-Up (No Equipment)"
  },
  {
    "mode": "calisthenics",
    "id": "lunge",
    "requirements": [
      []
    ],
    "previous_id_label": "Reverse lunge",
    "previous_en_label": "Reverse lunge",
    "id_label": "Reverse Lunge (Tanpa Alat)",
    "en_label": "Reverse Lunge (No Equipment)"
  },
  {
    "mode": "calisthenics",
    "id": "lying_leg_raise",
    "requirements": [
      []
    ],
    "previous_id_label": "Angkat kaki berbaring",
    "previous_en_label": "Lying leg raise",
    "id_label": "Angkat Kaki Berbaring (Tanpa Alat)",
    "en_label": "Lying Leg Raise (No Equipment)"
  },
  {
    "mode": "calisthenics",
    "id": "mountain_climber",
    "requirements": [
      []
    ],
    "previous_id_label": "Mountain climber",
    "previous_en_label": "Mountain climber",
    "id_label": "Mountain Climber (Tanpa Alat)",
    "en_label": "Mountain Climber (No Equipment)"
  },
  {
    "mode": "calisthenics",
    "id": "pike_pushup",
    "requirements": [
      []
    ],
    "previous_id_label": "Pike push-up",
    "previous_en_label": "Pike push-up",
    "id_label": "Pike Push-Up (Tanpa Alat)",
    "en_label": "Pike Push-Up (No Equipment)"
  },
  {
    "mode": "calisthenics",
    "id": "plank",
    "requirements": [
      []
    ],
    "previous_id_label": "Plank lengan bawah",
    "previous_en_label": "Forearm plank",
    "id_label": "Plank Lengan Bawah (Tanpa Alat)",
    "en_label": "Forearm Plank (No Equipment)"
  },
  {
    "mode": "calisthenics",
    "id": "pullup",
    "requirements": [
      [
        "pull_up_bar"
      ]
    ],
    "previous_id_label": "Pull-up",
    "previous_en_label": "Pull-up",
    "id_label": "Pull-Up (Palang Pull-Up)",
    "en_label": "Pull-Up (Pull-Up Bar)"
  },
  {
    "mode": "calisthenics",
    "id": "pushup",
    "requirements": [
      []
    ],
    "previous_id_label": "Push-up",
    "previous_en_label": "Push-up",
    "id_label": "Push-Up (Tanpa Alat)",
    "en_label": "Push-Up (No Equipment)"
  },
  {
    "mode": "calisthenics",
    "id": "reverse_crunch",
    "requirements": [
      []
    ],
    "previous_id_label": "Crunch terbalik",
    "previous_en_label": "Reverse crunch",
    "id_label": "Crunch Terbalik (Tanpa Alat)",
    "en_label": "Reverse Crunch (No Equipment)"
  },
  {
    "mode": "calisthenics",
    "id": "ring_row",
    "requirements": [
      [
        "rings"
      ]
    ],
    "previous_id_label": "Row ring",
    "previous_en_label": "Ring row",
    "id_label": "Row (Ring)",
    "en_label": "Row (Rings)"
  },
  {
    "mode": "calisthenics",
    "id": "single_leg_bridge",
    "requirements": [
      []
    ],
    "previous_id_label": "Bridge satu kaki",
    "previous_en_label": "Single-leg glute bridge",
    "id_label": "Bridge Satu Kaki (Tanpa Alat)",
    "en_label": "Single-Leg Glute Bridge (No Equipment)"
  },
  {
    "mode": "calisthenics",
    "id": "split_squat",
    "requirements": [
      []
    ],
    "previous_id_label": "Split squat",
    "previous_en_label": "Split squat",
    "id_label": "Split Squat (Tanpa Alat)",
    "en_label": "Split Squat (No Equipment)"
  },
  {
    "mode": "calisthenics",
    "id": "squat",
    "requirements": [
      []
    ],
    "previous_id_label": "Bodyweight squat",
    "previous_en_label": "Bodyweight squat",
    "id_label": "Squat (Tanpa Alat)",
    "en_label": "Squat (No Equipment)"
  },
  {
    "mode": "calisthenics",
    "id": "step_up",
    "requirements": [
      [
        "bench"
      ]
    ],
    "previous_id_label": "Naik bangku",
    "previous_en_label": "Step-up",
    "id_label": "Step-Up (Bangku)",
    "en_label": "Step-Up (Bench)"
  },
  {
    "mode": "calisthenics",
    "id": "supported_reverse_lunge",
    "requirements": [
      [
        "chair"
      ]
    ],
    "previous_id_label": "Reverse lunge dengan pegangan",
    "previous_en_label": "Supported reverse lunge",
    "id_label": "Reverse Lunge Dengan Pegangan (Kursi)",
    "en_label": "Supported Reverse Lunge (Chair)"
  },
  {
    "mode": "calisthenics",
    "id": "wall_pushup",
    "requirements": [
      []
    ],
    "previous_id_label": "Push-up dinding",
    "previous_en_label": "Wall push-up",
    "id_label": "Push-Up Dinding (Tanpa Alat)",
    "en_label": "Wall Push-Up (No Equipment)"
  },
  {
    "mode": "calisthenics",
    "id": "wide_pushup",
    "requirements": [
      []
    ],
    "previous_id_label": "Push-up tangan lebar",
    "previous_en_label": "Wide push-up",
    "id_label": "Push-Up Tangan Lebar (Tanpa Alat)",
    "en_label": "Wide Push-Up (No Equipment)"
  },
  {
    "mode": "gym",
    "id": "alternating_dumbbell_bench_press",
    "requirements": [
      [
        "dumbbell",
        "bench"
      ]
    ],
    "previous_id_label": "Alternating Dumbbell Bench Press",
    "previous_en_label": "Alternating Dumbbell Bench Press",
    "id_label": "Alternating Bench Press (Dumbbell)",
    "en_label": "Alternating Bench Press (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "assisted_pull_up_machine",
    "requirements": [
      [
        "assisted_pullup_machine"
      ]
    ],
    "previous_id_label": "Assisted Pull-Up Machine",
    "previous_en_label": "Assisted Pull-Up Machine",
    "id_label": "Assisted Pull-Up (Mesin)",
    "en_label": "Assisted Pull-Up (Machine)"
  },
  {
    "mode": "gym",
    "id": "back_squat",
    "requirements": [
      [
        "barbell",
        "squat_rack"
      ]
    ],
    "previous_id_label": "Squat barbel belakang",
    "previous_en_label": "Barbell back squat",
    "id_label": "Squat Belakang (Barbel)",
    "en_label": "Back Squat (Barbell)"
  },
  {
    "mode": "gym",
    "id": "barbell_floor_press",
    "requirements": [
      [
        "barbell"
      ]
    ],
    "previous_id_label": "Barbell Floor Press",
    "previous_en_label": "Barbell Floor Press",
    "id_label": "Floor Press (Barbel)",
    "en_label": "Floor Press (Barbell)"
  },
  {
    "mode": "gym",
    "id": "barbell_pullover",
    "requirements": [
      [
        "barbell",
        "bench"
      ]
    ],
    "previous_id_label": "Barbell Pullover",
    "previous_en_label": "Barbell Pullover",
    "id_label": "Pullover (Barbel)",
    "en_label": "Pullover (Barbell)"
  },
  {
    "mode": "gym",
    "id": "barbell_row",
    "requirements": [
      [
        "barbell"
      ]
    ],
    "previous_id_label": "Row barbel",
    "previous_en_label": "Barbell row",
    "id_label": "Row (Barbel)",
    "en_label": "Row (Barbell)"
  },
  {
    "mode": "gym",
    "id": "barbell_seal_row",
    "requirements": [
      [
        "barbell",
        "bench"
      ]
    ],
    "previous_id_label": "Barbell Seal Row",
    "previous_en_label": "Barbell Seal Row",
    "id_label": "Seal Row (Barbel)",
    "en_label": "Seal Row (Barbell)"
  },
  {
    "mode": "gym",
    "id": "bench_press",
    "requirements": [
      [
        "barbell",
        "bench"
      ]
    ],
    "previous_id_label": "Bench press barbel",
    "previous_en_label": "Barbell bench press",
    "id_label": "Bench Press (Barbel)",
    "en_label": "Bench Press (Barbell)"
  },
  {
    "mode": "gym",
    "id": "bent_over_dumbbell_row",
    "requirements": [
      [
        "dumbbell"
      ]
    ],
    "previous_id_label": "Bent-Over Dumbbell Row",
    "previous_en_label": "Bent-Over Dumbbell Row",
    "id_label": "Bent-Over Row (Dumbbell)",
    "en_label": "Bent-Over Row (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "bulgarian_split_squat",
    "requirements": [
      [
        "dumbbell",
        "bench"
      ]
    ],
    "previous_id_label": "Split squat Bulgaria",
    "previous_en_label": "Bulgarian split squat",
    "id_label": "Split Squat Bulgaria (Dumbbell)",
    "en_label": "Bulgarian Split Squat (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "cable_lateral_raise",
    "requirements": [
      [
        "cable_machine"
      ]
    ],
    "previous_id_label": "Cable Lateral Raise",
    "previous_en_label": "Cable Lateral Raise",
    "id_label": "Lateral Raise (Kabel)",
    "en_label": "Lateral Raise (Cable)"
  },
  {
    "mode": "gym",
    "id": "cable_triceps_pushdown",
    "requirements": [
      [
        "cable_machine"
      ]
    ],
    "previous_id_label": "Cable Triceps Pushdown",
    "previous_en_label": "Cable Triceps Pushdown",
    "id_label": "Triceps Pushdown (Kabel)",
    "en_label": "Triceps Pushdown (Cable)"
  },
  {
    "mode": "gym",
    "id": "calf_raise",
    "requirements": [
      [
        "dumbbell"
      ]
    ],
    "previous_id_label": "Angkat tumit dumbbell",
    "previous_en_label": "Dumbbell calf raise",
    "id_label": "Angkat Tumit (Dumbbell)",
    "en_label": "Calf Raise (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "chair_sit_to_stand",
    "requirements": [
      [
        "chair"
      ]
    ],
    "previous_id_label": "Duduk-berdiri dari kursi",
    "previous_en_label": "Chair sit-to-stand",
    "id_label": "Duduk-Berdiri (Kursi)",
    "en_label": "Sit-to-Stand (Chair)"
  },
  {
    "mode": "gym",
    "id": "chest_press_plate_loaded",
    "requirements": [
      [
        "plate_loaded_chest_press_machine"
      ]
    ],
    "previous_id_label": "Chest Press Plate Loaded",
    "previous_en_label": "Chest Press Plate Loaded",
    "id_label": "Chest Press (Plate-Loaded)",
    "en_label": "Chest Press (Plate-Loaded)"
  },
  {
    "mode": "gym",
    "id": "chest_supported_dumbbell_row",
    "requirements": [
      [
        "dumbbell",
        "bench"
      ]
    ],
    "previous_id_label": "Chest-Supported Dumbbell Row",
    "previous_en_label": "Chest-Supported Dumbbell Row",
    "id_label": "Chest-Supported Row (Dumbbell)",
    "en_label": "Chest-Supported Row (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "chest_supported_row_machine",
    "requirements": [
      [
        "chest_supported_row_machine"
      ]
    ],
    "previous_id_label": "Chest-Supported Row Machine",
    "previous_en_label": "Chest-Supported Row Machine",
    "id_label": "Chest-Supported Row (Mesin)",
    "en_label": "Chest-Supported Row (Machine)"
  },
  {
    "mode": "gym",
    "id": "close_grip_lat_pulldown",
    "requirements": [
      [
        "lat_pulldown_machine"
      ]
    ],
    "previous_id_label": "Close-Grip Lat Pulldown",
    "previous_en_label": "Close-Grip Lat Pulldown",
    "id_label": "Close-Grip Lat Pulldown (Kabel)",
    "en_label": "Close-Grip Lat Pulldown (Cable)"
  },
  {
    "mode": "gym",
    "id": "curl",
    "requirements": [
      [
        "dumbbell"
      ]
    ],
    "previous_id_label": "Dumbbell curl",
    "previous_en_label": "Dumbbell curl",
    "id_label": "Curl (Dumbbell)",
    "en_label": "Curl (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "dead_bug",
    "requirements": [
      []
    ],
    "previous_id_label": "Dead bug",
    "previous_en_label": "Dead bug",
    "id_label": "Dead Bug (Tanpa Alat)",
    "en_label": "Dead Bug (No Equipment)"
  },
  {
    "mode": "gym",
    "id": "deadlift",
    "requirements": [
      [
        "barbell"
      ]
    ],
    "previous_id_label": "Deadlift barbel",
    "previous_en_label": "Barbell deadlift",
    "id_label": "Deadlift (Barbel)",
    "en_label": "Deadlift (Barbell)"
  },
  {
    "mode": "gym",
    "id": "decline_barbell_bench_press",
    "requirements": [
      [
        "barbell",
        "bench"
      ]
    ],
    "previous_id_label": "Decline Barbell Bench Press",
    "previous_en_label": "Decline Barbell Bench Press",
    "id_label": "Decline Bench Press (Barbel)",
    "en_label": "Decline Bench Press (Barbell)"
  },
  {
    "mode": "gym",
    "id": "decline_chest_press_machine",
    "requirements": [
      [
        "decline_chest_press_machine"
      ]
    ],
    "previous_id_label": "Decline Chest Press Machine",
    "previous_en_label": "Decline Chest Press Machine",
    "id_label": "Decline Chest Press (Mesin)",
    "en_label": "Decline Chest Press (Machine)"
  },
  {
    "mode": "gym",
    "id": "decline_chest_press_plate_loaded",
    "requirements": [
      [
        "decline_plate_loaded_chest_press_machine"
      ]
    ],
    "previous_id_label": "Decline Chest Press Plate Loaded",
    "previous_en_label": "Decline Chest Press Plate Loaded",
    "id_label": "Decline Chest Press (Plate-Loaded)",
    "en_label": "Decline Chest Press (Plate-Loaded)"
  },
  {
    "mode": "gym",
    "id": "decline_dumbbell_bench_press",
    "requirements": [
      [
        "dumbbell",
        "bench"
      ]
    ],
    "previous_id_label": "Decline Dumbbell Bench Press",
    "previous_en_label": "Decline Dumbbell Bench Press",
    "id_label": "Decline Bench Press (Dumbbell)",
    "en_label": "Decline Bench Press (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "decline_dumbbell_fly",
    "requirements": [
      [
        "dumbbell",
        "bench"
      ]
    ],
    "previous_id_label": "Decline Dumbbell Fly",
    "previous_en_label": "Decline Dumbbell Fly",
    "id_label": "Decline Fly (Dumbbell)",
    "en_label": "Decline Fly (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "dumbbell_floor_fly",
    "requirements": [
      [
        "dumbbell"
      ]
    ],
    "previous_id_label": "Dumbbell Floor Fly",
    "previous_en_label": "Dumbbell Floor Fly",
    "id_label": "Floor Fly (Dumbbell)",
    "en_label": "Floor Fly (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "dumbbell_fly",
    "requirements": [
      [
        "dumbbell",
        "bench"
      ]
    ],
    "previous_id_label": "Fly dumbbell",
    "previous_en_label": "Dumbbell fly",
    "id_label": "Fly (Dumbbell)",
    "en_label": "Fly (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "dumbbell_pullover",
    "requirements": [
      [
        "dumbbell",
        "bench"
      ]
    ],
    "previous_id_label": "Dumbbell Pullover",
    "previous_en_label": "Dumbbell Pullover",
    "id_label": "Pullover (Dumbbell)",
    "en_label": "Pullover (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "dumbbell_renegade_row",
    "requirements": [
      [
        "dumbbell"
      ]
    ],
    "previous_id_label": "Dumbbell Renegade Row",
    "previous_en_label": "Dumbbell Renegade Row",
    "id_label": "Renegade Row (Dumbbell)",
    "en_label": "Renegade Row (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "dumbbell_seal_row",
    "requirements": [
      [
        "dumbbell",
        "bench"
      ]
    ],
    "previous_id_label": "Dumbbell Seal Row",
    "previous_en_label": "Dumbbell Seal Row",
    "id_label": "Seal Row (Dumbbell)",
    "en_label": "Seal Row (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "dumbbell_shoulder_press",
    "requirements": [
      [
        "dumbbell"
      ]
    ],
    "previous_id_label": "Press bahu dumbbell",
    "previous_en_label": "Dumbbell shoulder press",
    "id_label": "Press Bahu (Dumbbell)",
    "en_label": "Shoulder Press (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "dumbbell_squeeze_press",
    "requirements": [
      [
        "dumbbell",
        "bench"
      ]
    ],
    "previous_id_label": "Dumbbell Squeeze Press",
    "previous_en_label": "Dumbbell Squeeze Press",
    "id_label": "Squeeze Press (Dumbbell)",
    "en_label": "Squeeze Press (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "face_pull",
    "requirements": [
      [
        "cable_machine"
      ]
    ],
    "previous_id_label": "Face pull",
    "previous_en_label": "Face pull",
    "id_label": "Face Pull (Kabel)",
    "en_label": "Face Pull (Cable)"
  },
  {
    "mode": "gym",
    "id": "flat_bench_cable_chest_press",
    "requirements": [
      [
        "cable_machine",
        "bench"
      ]
    ],
    "previous_id_label": "Flat Bench Cable Chest Press",
    "previous_en_label": "Flat Bench Cable Chest Press",
    "id_label": "Flat Bench Chest Press (Kabel)",
    "en_label": "Flat Bench Chest Press (Cable)"
  },
  {
    "mode": "gym",
    "id": "flat_bench_cable_fly",
    "requirements": [
      [
        "cable_machine",
        "bench"
      ]
    ],
    "previous_id_label": "Flat Bench Cable Fly",
    "previous_en_label": "Flat Bench Cable Fly",
    "id_label": "Flat Bench Fly (Kabel)",
    "en_label": "Flat Bench Fly (Cable)"
  },
  {
    "mode": "gym",
    "id": "flat_dumbbell_bench_press",
    "requirements": [
      [
        "dumbbell",
        "bench"
      ]
    ],
    "previous_id_label": "Flat Dumbbell Bench Press",
    "previous_en_label": "Flat Dumbbell Bench Press",
    "id_label": "Flat Bench Press (Dumbbell)",
    "en_label": "Flat Bench Press (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "front_squat",
    "requirements": [
      [
        "barbell",
        "squat_rack"
      ]
    ],
    "previous_id_label": "Squat barbel depan",
    "previous_en_label": "Barbell front squat",
    "id_label": "Squat Depan (Barbel)",
    "en_label": "Front Squat (Barbell)"
  },
  {
    "mode": "gym",
    "id": "hammer_curl",
    "requirements": [
      [
        "dumbbell"
      ]
    ],
    "previous_id_label": "Hammer curl",
    "previous_en_label": "Hammer curl",
    "id_label": "Hammer Curl (Dumbbell)",
    "en_label": "Hammer Curl (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "high_iso_lateral_row_plate_loaded",
    "requirements": [
      [
        "high_iso_lateral_row_plate_loaded_machine"
      ]
    ],
    "previous_id_label": "High Iso Lateral Row Plate Loaded",
    "previous_en_label": "High Iso Lateral Row Plate Loaded",
    "id_label": "High Iso Lateral Row (Plate-Loaded)",
    "en_label": "High Iso Lateral Row (Plate-Loaded)"
  },
  {
    "mode": "gym",
    "id": "high_row_machine",
    "requirements": [
      [
        "high_row_machine"
      ]
    ],
    "previous_id_label": "High Row Machine",
    "previous_en_label": "High Row Machine",
    "id_label": "High Row (Mesin)",
    "en_label": "High Row (Machine)"
  },
  {
    "mode": "gym",
    "id": "high_to_low_cable_fly",
    "requirements": [
      [
        "cable_machine"
      ]
    ],
    "previous_id_label": "High-to-Low Cable Fly",
    "previous_en_label": "High-to-Low Cable Fly",
    "id_label": "High-To-Low Fly (Kabel)",
    "en_label": "High-To-Low Fly (Cable)"
  },
  {
    "mode": "gym",
    "id": "hip_thrust",
    "requirements": [
      [
        "barbell",
        "bench"
      ]
    ],
    "previous_id_label": "Hip thrust barbel",
    "previous_en_label": "Barbell hip thrust",
    "id_label": "Hip Thrust (Barbel)",
    "en_label": "Hip Thrust (Barbell)"
  },
  {
    "mode": "gym",
    "id": "incline_barbell_bench_press",
    "requirements": [
      [
        "barbell",
        "bench"
      ]
    ],
    "previous_id_label": "Incline Barbell Bench Press",
    "previous_en_label": "Incline Barbell Bench Press",
    "id_label": "Incline Bench Press (Barbel)",
    "en_label": "Incline Bench Press (Barbell)"
  },
  {
    "mode": "gym",
    "id": "incline_bench_cable_chest_press",
    "requirements": [
      [
        "cable_machine",
        "bench"
      ]
    ],
    "previous_id_label": "Incline Bench Cable Chest Press",
    "previous_en_label": "Incline Bench Cable Chest Press",
    "id_label": "Incline Bench Chest Press (Kabel)",
    "en_label": "Incline Bench Chest Press (Cable)"
  },
  {
    "mode": "gym",
    "id": "incline_bench_cable_fly",
    "requirements": [
      [
        "cable_machine",
        "bench"
      ]
    ],
    "previous_id_label": "Incline Bench Cable Fly",
    "previous_en_label": "Incline Bench Cable Fly",
    "id_label": "Incline Bench Fly (Kabel)",
    "en_label": "Incline Bench Fly (Cable)"
  },
  {
    "mode": "gym",
    "id": "incline_bench_dumbbell_row",
    "requirements": [
      [
        "dumbbell",
        "bench"
      ]
    ],
    "previous_id_label": "Incline Bench Dumbbell Row",
    "previous_en_label": "Incline Bench Dumbbell Row",
    "id_label": "Incline Bench Row (Dumbbell)",
    "en_label": "Incline Bench Row (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "incline_chest_press_machine",
    "requirements": [
      [
        "incline_chest_press_machine"
      ]
    ],
    "previous_id_label": "Incline Chest Press Machine",
    "previous_en_label": "Incline Chest Press Machine",
    "id_label": "Incline Chest Press (Mesin)",
    "en_label": "Incline Chest Press (Machine)"
  },
  {
    "mode": "gym",
    "id": "incline_chest_press_plate_loaded",
    "requirements": [
      [
        "incline_plate_loaded_chest_press_machine"
      ]
    ],
    "previous_id_label": "Incline Chest Press Plate Loaded",
    "previous_en_label": "Incline Chest Press Plate Loaded",
    "id_label": "Incline Chest Press (Plate-Loaded)",
    "en_label": "Incline Chest Press (Plate-Loaded)"
  },
  {
    "mode": "gym",
    "id": "incline_dumbbell_fly",
    "requirements": [
      [
        "dumbbell",
        "bench"
      ]
    ],
    "previous_id_label": "Incline Dumbbell Fly",
    "previous_en_label": "Incline Dumbbell Fly",
    "id_label": "Incline Fly (Dumbbell)",
    "en_label": "Incline Fly (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "incline_dumbbell_press",
    "requirements": [
      [
        "dumbbell",
        "bench"
      ]
    ],
    "previous_id_label": "Press dumbbell incline",
    "previous_en_label": "Incline dumbbell press",
    "id_label": "Press Incline (Dumbbell)",
    "en_label": "Incline Press (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "iso_lateral_row_machine",
    "requirements": [
      [
        "iso_lateral_row_machine"
      ]
    ],
    "previous_id_label": "Iso-Lateral Row Machine",
    "previous_en_label": "Iso-Lateral Row Machine",
    "id_label": "Iso-Lateral Row (Mesin)",
    "en_label": "Iso-Lateral Row (Machine)"
  },
  {
    "mode": "gym",
    "id": "iso_lateral_row_plate_loaded",
    "requirements": [
      [
        "iso_lateral_row_plate_loaded_machine"
      ]
    ],
    "previous_id_label": "Iso Lateral Row Plate Loaded",
    "previous_en_label": "Iso Lateral Row Plate Loaded",
    "id_label": "Iso Lateral Row (Plate-Loaded)",
    "en_label": "Iso Lateral Row (Plate-Loaded)"
  },
  {
    "mode": "gym",
    "id": "landmine_single_arm_row",
    "requirements": [
      [
        "barbell",
        "landmine"
      ]
    ],
    "previous_id_label": "Landmine Single-Arm Row",
    "previous_en_label": "Landmine Single-Arm Row",
    "id_label": "Landmine Single-Arm Row (Barbel)",
    "en_label": "Landmine Single-Arm Row (Barbell)"
  },
  {
    "mode": "gym",
    "id": "lat_pulldown",
    "requirements": [
      [
        "lat_pulldown_machine"
      ]
    ],
    "previous_id_label": "Lat pulldown",
    "previous_en_label": "Lat pulldown",
    "id_label": "Lat Pulldown (Kabel)",
    "en_label": "Lat Pulldown (Cable)"
  },
  {
    "mode": "gym",
    "id": "lat_pulldown_cable_machine",
    "requirements": [
      [
        "lat_pulldown_machine"
      ]
    ],
    "previous_id_label": "Lat Pulldown Cable Machine",
    "previous_en_label": "Lat Pulldown Cable Machine",
    "id_label": "Lat Pulldown (Kabel)",
    "en_label": "Lat Pulldown (Cable)"
  },
  {
    "mode": "gym",
    "id": "lat_pulldown_machine",
    "requirements": [
      [
        "lat_pulldown_standard_machine"
      ]
    ],
    "previous_id_label": "Lat Pulldown Machine",
    "previous_en_label": "Lat Pulldown Machine",
    "id_label": "Lat Pulldown (Mesin)",
    "en_label": "Lat Pulldown (Machine)"
  },
  {
    "mode": "gym",
    "id": "lat_pulldown_plate_loaded",
    "requirements": [
      [
        "lat_pulldown_plate_loaded_machine"
      ]
    ],
    "previous_id_label": "Lat Pulldown Plate Loaded",
    "previous_en_label": "Lat Pulldown Plate Loaded",
    "id_label": "Lat Pulldown (Plate-Loaded)",
    "en_label": "Lat Pulldown (Plate-Loaded)"
  },
  {
    "mode": "gym",
    "id": "leg_curl",
    "requirements": [
      [
        "leg_curl_machine"
      ]
    ],
    "previous_id_label": "Curl paha",
    "previous_en_label": "Leg curl",
    "id_label": "Curl Paha (Mesin)",
    "en_label": "Leg Curl (Machine)"
  },
  {
    "mode": "gym",
    "id": "leg_extension",
    "requirements": [
      [
        "leg_extension_machine"
      ]
    ],
    "previous_id_label": "Ekstensi paha",
    "previous_en_label": "Leg extension",
    "id_label": "Ekstensi Paha (Mesin)",
    "en_label": "Leg Extension (Machine)"
  },
  {
    "mode": "gym",
    "id": "leg_press",
    "requirements": [
      [
        "leg_press_machine"
      ]
    ],
    "previous_id_label": "Leg press",
    "previous_en_label": "Leg press",
    "id_label": "Leg Press (Mesin)",
    "en_label": "Leg Press (Machine)"
  },
  {
    "mode": "gym",
    "id": "low_row_machine",
    "requirements": [
      [
        "low_row_machine"
      ]
    ],
    "previous_id_label": "Low Row Machine",
    "previous_en_label": "Low Row Machine",
    "id_label": "Low Row (Mesin)",
    "en_label": "Low Row (Machine)"
  },
  {
    "mode": "gym",
    "id": "low_to_high_cable_fly",
    "requirements": [
      [
        "cable_machine"
      ]
    ],
    "previous_id_label": "Low-to-High Cable Fly",
    "previous_en_label": "Low-to-High Cable Fly",
    "id_label": "Low-To-High Fly (Kabel)",
    "en_label": "Low-To-High Fly (Cable)"
  },
  {
    "mode": "gym",
    "id": "lunge",
    "requirements": [
      []
    ],
    "previous_id_label": "Reverse lunge",
    "previous_en_label": "Reverse lunge",
    "id_label": "Reverse Lunge (Tanpa Alat)",
    "en_label": "Reverse Lunge (No Equipment)"
  },
  {
    "mode": "gym",
    "id": "machine_lateral_raise",
    "requirements": [
      [
        "lateral_raise_machine"
      ]
    ],
    "previous_id_label": "Machine Lateral Raise",
    "previous_en_label": "Machine Lateral Raise",
    "id_label": "Lateral Raise (Mesin)",
    "en_label": "Lateral Raise (Machine)"
  },
  {
    "mode": "gym",
    "id": "meadows_row",
    "requirements": [
      [
        "barbell",
        "landmine"
      ]
    ],
    "previous_id_label": "Meadows Row",
    "previous_en_label": "Meadows Row",
    "id_label": "Meadows Row (Barbel)",
    "en_label": "Meadows Row (Barbell)"
  },
  {
    "mode": "gym",
    "id": "neutral_grip_dumbbell_bench_press",
    "requirements": [
      [
        "dumbbell",
        "bench"
      ]
    ],
    "previous_id_label": "Neutral-Grip Dumbbell Bench Press",
    "previous_en_label": "Neutral-Grip Dumbbell Bench Press",
    "id_label": "Neutral-Grip Bench Press (Dumbbell)",
    "en_label": "Neutral-Grip Bench Press (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "neutral_grip_lat_pulldown",
    "requirements": [
      [
        "lat_pulldown_machine"
      ]
    ],
    "previous_id_label": "Neutral-Grip Lat Pulldown",
    "previous_en_label": "Neutral-Grip Lat Pulldown",
    "id_label": "Neutral-Grip Lat Pulldown (Kabel)",
    "en_label": "Neutral-Grip Lat Pulldown (Cable)"
  },
  {
    "mode": "gym",
    "id": "overhead_cable_triceps_extension",
    "requirements": [
      [
        "cable_machine"
      ]
    ],
    "previous_id_label": "Overhead Cable Triceps Extension",
    "previous_en_label": "Overhead Cable Triceps Extension",
    "id_label": "Overhead Triceps Extension (Kabel)",
    "en_label": "Overhead Triceps Extension (Cable)"
  },
  {
    "mode": "gym",
    "id": "overhead_press",
    "requirements": [
      [
        "barbell"
      ]
    ],
    "previous_id_label": "Press bahu barbel",
    "previous_en_label": "Barbell overhead press",
    "id_label": "Press Bahu (Barbel)",
    "en_label": "Overhead Press (Barbell)"
  },
  {
    "mode": "gym",
    "id": "paused_barbell_bench_press",
    "requirements": [
      [
        "barbell",
        "bench"
      ]
    ],
    "previous_id_label": "Paused Barbell Bench Press",
    "previous_en_label": "Paused Barbell Bench Press",
    "id_label": "Paused Bench Press (Barbel)",
    "en_label": "Paused Bench Press (Barbell)"
  },
  {
    "mode": "gym",
    "id": "pec_deck_butterfly_machine",
    "requirements": [
      [
        "pec_deck_machine"
      ]
    ],
    "previous_id_label": "Pec Deck / Butterfly Machine",
    "previous_en_label": "Pec Deck / Butterfly Machine",
    "id_label": "Pec Deck / Butterfly (Mesin)",
    "en_label": "Pec Deck / Butterfly (Machine)"
  },
  {
    "mode": "gym",
    "id": "pendlay_row",
    "requirements": [
      [
        "barbell"
      ]
    ],
    "previous_id_label": "Pendlay Row",
    "previous_en_label": "Pendlay Row",
    "id_label": "Pendlay Row (Barbel)",
    "en_label": "Pendlay Row (Barbell)"
  },
  {
    "mode": "gym",
    "id": "plank",
    "requirements": [
      []
    ],
    "previous_id_label": "Plank lengan bawah",
    "previous_en_label": "Forearm plank",
    "id_label": "Plank Lengan Bawah (Tanpa Alat)",
    "en_label": "Forearm Plank (No Equipment)"
  },
  {
    "mode": "gym",
    "id": "plate_loaded_chest_supported_t_bar_row",
    "requirements": [
      [
        "plate_loaded_chest_supported_t_bar_row_machine"
      ]
    ],
    "previous_id_label": "Plate-Loaded Chest-Supported T-Bar Row",
    "previous_en_label": "Plate-Loaded Chest-Supported T-Bar Row",
    "id_label": "Chest-Supported T-Bar Row (Plate-Loaded)",
    "en_label": "Chest-Supported T-Bar Row (Plate-Loaded)"
  },
  {
    "mode": "gym",
    "id": "plate_loaded_lateral_raise",
    "requirements": [
      [
        "plate_loaded_lateral_raise_machine"
      ]
    ],
    "previous_id_label": "Plate-Loaded Lateral Raise",
    "previous_en_label": "Plate-Loaded Lateral Raise",
    "id_label": "Lateral Raise (Plate-Loaded)",
    "en_label": "Lateral Raise (Plate-Loaded)"
  },
  {
    "mode": "gym",
    "id": "plate_loaded_t_bar_row",
    "requirements": [
      [
        "plate_loaded_t_bar_row_machine"
      ]
    ],
    "previous_id_label": "Plate-Loaded T-Bar Row",
    "previous_en_label": "Plate-Loaded T-Bar Row",
    "id_label": "T-Bar Row (Plate-Loaded)",
    "en_label": "T-Bar Row (Plate-Loaded)"
  },
  {
    "mode": "gym",
    "id": "press",
    "requirements": [
      [
        "dumbbell"
      ]
    ],
    "previous_id_label": "Dumbbell floor press",
    "previous_en_label": "Dumbbell floor press",
    "id_label": "Floor Press (Dumbbell)",
    "en_label": "Floor Press (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "pullover_machine",
    "requirements": [
      [
        "pullover_machine"
      ]
    ],
    "previous_id_label": "Pullover Machine",
    "previous_en_label": "Pullover Machine",
    "id_label": "Pullover (Mesin)",
    "en_label": "Pullover (Machine)"
  },
  {
    "mode": "gym",
    "id": "raise",
    "requirements": [
      [
        "dumbbell"
      ]
    ],
    "previous_id_label": "Dumbbell Lateral Raise",
    "previous_en_label": "Dumbbell Lateral Raise",
    "id_label": "Lateral Raise (Dumbbell)",
    "en_label": "Lateral Raise (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "reverse_grip_lat_pulldown",
    "requirements": [
      [
        "lat_pulldown_machine"
      ]
    ],
    "previous_id_label": "Reverse-Grip Lat Pulldown",
    "previous_en_label": "Reverse-Grip Lat Pulldown",
    "id_label": "Reverse-Grip Lat Pulldown (Kabel)",
    "en_label": "Reverse-Grip Lat Pulldown (Cable)"
  },
  {
    "mode": "gym",
    "id": "romanian_deadlift",
    "requirements": [
      [
        "barbell"
      ]
    ],
    "previous_id_label": "Deadlift Romania",
    "previous_en_label": "Romanian deadlift",
    "id_label": "Deadlift Romania (Barbel)",
    "en_label": "Romanian Deadlift (Barbell)"
  },
  {
    "mode": "gym",
    "id": "row",
    "requirements": [
      [
        "dumbbell"
      ]
    ],
    "previous_id_label": "Dumbbell row",
    "previous_en_label": "Dumbbell row",
    "id_label": "Row (Dumbbell)",
    "en_label": "Row (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "seated_cable_row",
    "requirements": [
      [
        "cable_machine"
      ]
    ],
    "previous_id_label": "Row kabel duduk",
    "previous_en_label": "Seated cable row",
    "id_label": "Row Duduk (Kabel)",
    "en_label": "Seated Row (Cable)"
  },
  {
    "mode": "gym",
    "id": "seated_chest_press_machine",
    "requirements": [
      [
        "chest_press_machine"
      ]
    ],
    "previous_id_label": "Seated Chest Press Machine",
    "previous_en_label": "Seated Chest Press Machine",
    "id_label": "Seated Chest Press (Mesin)",
    "en_label": "Seated Chest Press (Machine)"
  },
  {
    "mode": "gym",
    "id": "seated_chest_press_plate_loaded",
    "requirements": [
      [
        "plate_loaded_chest_press_machine"
      ]
    ],
    "previous_id_label": "Seated Chest Press Plate Loaded",
    "previous_en_label": "Seated Chest Press Plate Loaded",
    "id_label": "Seated Chest Press (Plate-Loaded)",
    "en_label": "Seated Chest Press (Plate-Loaded)"
  },
  {
    "mode": "gym",
    "id": "seated_decline_chest_press_plate_loaded",
    "requirements": [
      [
        "decline_plate_loaded_chest_press_machine"
      ]
    ],
    "previous_id_label": "Seated Decline Chest Press Plate Loaded",
    "previous_en_label": "Seated Decline Chest Press Plate Loaded",
    "id_label": "Seated Decline Chest Press (Plate-Loaded)",
    "en_label": "Seated Decline Chest Press (Plate-Loaded)"
  },
  {
    "mode": "gym",
    "id": "seated_incline_chest_press_plate_loaded",
    "requirements": [
      [
        "incline_plate_loaded_chest_press_machine"
      ]
    ],
    "previous_id_label": "Seated Incline Chest Press Plate Loaded",
    "previous_en_label": "Seated Incline Chest Press Plate Loaded",
    "id_label": "Seated Incline Chest Press (Plate-Loaded)",
    "en_label": "Seated Incline Chest Press (Plate-Loaded)"
  },
  {
    "mode": "gym",
    "id": "seated_machine_lateral_raise",
    "requirements": [
      [
        "lateral_raise_machine"
      ]
    ],
    "previous_id_label": "Seated Machine Lateral Raise",
    "previous_en_label": "Seated Machine Lateral Raise",
    "id_label": "Seated Lateral Raise (Mesin)",
    "en_label": "Seated Lateral Raise (Machine)"
  },
  {
    "mode": "gym",
    "id": "seated_plate_loaded_lateral_raise",
    "requirements": [
      [
        "plate_loaded_lateral_raise_machine"
      ]
    ],
    "previous_id_label": "Seated Plate-Loaded Lateral Raise",
    "previous_en_label": "Seated Plate-Loaded Lateral Raise",
    "id_label": "Seated Lateral Raise (Plate-Loaded)",
    "en_label": "Seated Lateral Raise (Plate-Loaded)"
  },
  {
    "mode": "gym",
    "id": "single_arm_cable_chest_press",
    "requirements": [
      [
        "cable_machine"
      ]
    ],
    "previous_id_label": "Single-Arm Cable Chest Press",
    "previous_en_label": "Single-Arm Cable Chest Press",
    "id_label": "Single-Arm Chest Press (Kabel)",
    "en_label": "Single-Arm Chest Press (Cable)"
  },
  {
    "mode": "gym",
    "id": "single_arm_cable_lateral_raise",
    "requirements": [
      [
        "cable_machine"
      ]
    ],
    "previous_id_label": "Single-Arm Cable Lateral Raise",
    "previous_en_label": "Single-Arm Cable Lateral Raise",
    "id_label": "Single-Arm Lateral Raise (Kabel)",
    "en_label": "Single-Arm Lateral Raise (Cable)"
  },
  {
    "mode": "gym",
    "id": "single_arm_cable_row",
    "requirements": [
      [
        "cable_machine"
      ]
    ],
    "previous_id_label": "Single-Arm Cable Row",
    "previous_en_label": "Single-Arm Cable Row",
    "id_label": "Single-Arm Row (Kabel)",
    "en_label": "Single-Arm Row (Cable)"
  },
  {
    "mode": "gym",
    "id": "single_arm_cable_triceps_pushdown",
    "requirements": [
      [
        "cable_machine"
      ]
    ],
    "previous_id_label": "Single-Arm Cable Triceps Pushdown",
    "previous_en_label": "Single-Arm Cable Triceps Pushdown",
    "id_label": "Single-Arm Triceps Pushdown (Kabel)",
    "en_label": "Single-Arm Triceps Pushdown (Cable)"
  },
  {
    "mode": "gym",
    "id": "single_arm_dumbbell_bench_press",
    "requirements": [
      [
        "dumbbell",
        "bench"
      ]
    ],
    "previous_id_label": "Single-Arm Dumbbell Bench Press",
    "previous_en_label": "Single-Arm Dumbbell Bench Press",
    "id_label": "Single-Arm Bench Press (Dumbbell)",
    "en_label": "Single-Arm Bench Press (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "single_arm_dumbbell_lateral_raise",
    "requirements": [
      [
        "dumbbell"
      ]
    ],
    "previous_id_label": "Single-Arm Dumbbell Lateral Raise",
    "previous_en_label": "Single-Arm Dumbbell Lateral Raise",
    "id_label": "Single-Arm Lateral Raise (Dumbbell)",
    "en_label": "Single-Arm Lateral Raise (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "single_arm_lat_pulldown",
    "requirements": [
      [
        "lat_pulldown_machine"
      ]
    ],
    "previous_id_label": "Single-Arm Lat Pulldown",
    "previous_en_label": "Single-Arm Lat Pulldown",
    "id_label": "Single-Arm Lat Pulldown (Kabel)",
    "en_label": "Single-Arm Lat Pulldown (Cable)"
  },
  {
    "mode": "gym",
    "id": "single_arm_overhead_cable_triceps_extension",
    "requirements": [
      [
        "cable_machine"
      ]
    ],
    "previous_id_label": "Single-Arm Overhead Cable Triceps Extension",
    "previous_en_label": "Single-Arm Overhead Cable Triceps Extension",
    "id_label": "Single-Arm Overhead Triceps Extension (Kabel)",
    "en_label": "Single-Arm Overhead Triceps Extension (Cable)"
  },
  {
    "mode": "gym",
    "id": "smith_machine_bench_press",
    "requirements": [
      [
        "smith_machine",
        "bench"
      ]
    ],
    "previous_id_label": "Smith Machine Bench Press",
    "previous_en_label": "Smith Machine Bench Press",
    "id_label": "Bench Press (Mesin Smith)",
    "en_label": "Bench Press (Smith Machine)"
  },
  {
    "mode": "gym",
    "id": "smith_machine_decline_bench_press",
    "requirements": [
      [
        "smith_machine",
        "bench"
      ]
    ],
    "previous_id_label": "Smith Machine Decline Bench Press",
    "previous_en_label": "Smith Machine Decline Bench Press",
    "id_label": "Decline Bench Press (Mesin Smith)",
    "en_label": "Decline Bench Press (Smith Machine)"
  },
  {
    "mode": "gym",
    "id": "smith_machine_incline_bench_press",
    "requirements": [
      [
        "smith_machine",
        "bench"
      ]
    ],
    "previous_id_label": "Smith Machine Incline Bench Press",
    "previous_en_label": "Smith Machine Incline Bench Press",
    "id_label": "Incline Bench Press (Mesin Smith)",
    "en_label": "Incline Bench Press (Smith Machine)"
  },
  {
    "mode": "gym",
    "id": "squat",
    "requirements": [
      [
        "dumbbell"
      ]
    ],
    "previous_id_label": "Goblet squat",
    "previous_en_label": "Goblet squat",
    "id_label": "Goblet Squat (Dumbbell)",
    "en_label": "Goblet Squat (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "standing_cable_chest_press",
    "requirements": [
      [
        "cable_machine"
      ]
    ],
    "previous_id_label": "Standing Cable Chest Press",
    "previous_en_label": "Standing Cable Chest Press",
    "id_label": "Standing Chest Press (Kabel)",
    "en_label": "Standing Chest Press (Cable)"
  },
  {
    "mode": "gym",
    "id": "standing_cable_fly",
    "requirements": [
      [
        "cable_machine"
      ]
    ],
    "previous_id_label": "Standing Cable Fly",
    "previous_en_label": "Standing Cable Fly",
    "id_label": "Standing Fly (Kabel)",
    "en_label": "Standing Fly (Cable)"
  },
  {
    "mode": "gym",
    "id": "standing_cable_row",
    "requirements": [
      [
        "cable_machine"
      ]
    ],
    "previous_id_label": "Standing Cable Row",
    "previous_en_label": "Standing Cable Row",
    "id_label": "Standing Row (Kabel)",
    "en_label": "Standing Row (Cable)"
  },
  {
    "mode": "gym",
    "id": "straight_arm_cable_pulldown",
    "requirements": [
      [
        "cable_machine"
      ]
    ],
    "previous_id_label": "Straight-Arm Cable Pulldown",
    "previous_en_label": "Straight-Arm Cable Pulldown",
    "id_label": "Straight-Arm Pulldown (Kabel)",
    "en_label": "Straight-Arm Pulldown (Cable)"
  },
  {
    "mode": "gym",
    "id": "supported_reverse_lunge",
    "requirements": [
      [
        "chair"
      ]
    ],
    "previous_id_label": "Reverse lunge dengan pegangan",
    "previous_en_label": "Supported reverse lunge",
    "id_label": "Reverse Lunge Dengan Pegangan (Kursi)",
    "en_label": "Supported Reverse Lunge (Chair)"
  },
  {
    "mode": "gym",
    "id": "t_bar_row",
    "requirements": [
      [
        "barbell",
        "landmine"
      ]
    ],
    "previous_id_label": "T-Bar Row",
    "previous_en_label": "T-Bar Row",
    "id_label": "T-Bar Row (Barbel)",
    "en_label": "T-Bar Row (Barbell)"
  },
  {
    "mode": "gym",
    "id": "triceps_extension",
    "requirements": [
      [
        "dumbbell"
      ]
    ],
    "previous_id_label": "Ekstensi trisep dumbbell",
    "previous_en_label": "Dumbbell triceps extension",
    "id_label": "Ekstensi Trisep (Dumbbell)",
    "en_label": "Triceps Extension (Dumbbell)"
  },
  {
    "mode": "gym",
    "id": "underhand_barbell_row",
    "requirements": [
      [
        "barbell"
      ]
    ],
    "previous_id_label": "Underhand Barbell Row",
    "previous_en_label": "Underhand Barbell Row",
    "id_label": "Underhand Row (Barbel)",
    "en_label": "Underhand Row (Barbell)"
  },
  {
    "mode": "gym",
    "id": "underhand_seated_cable_row",
    "requirements": [
      [
        "cable_machine"
      ]
    ],
    "previous_id_label": "Underhand Seated Cable Row",
    "previous_en_label": "Underhand Seated Cable Row",
    "id_label": "Underhand Seated Row (Kabel)",
    "en_label": "Underhand Seated Row (Cable)"
  },
  {
    "mode": "gym",
    "id": "wide_grip_lat_pulldown",
    "requirements": [
      [
        "lat_pulldown_machine"
      ]
    ],
    "previous_id_label": "Wide-Grip Lat Pulldown",
    "previous_en_label": "Wide-Grip Lat Pulldown",
    "id_label": "Wide-Grip Lat Pulldown (Kabel)",
    "en_label": "Wide-Grip Lat Pulldown (Cable)"
  },
  {
    "mode": "gym",
    "id": "wide_grip_seated_cable_row",
    "requirements": [
      [
        "cable_machine"
      ]
    ],
    "previous_id_label": "Wide-Grip Seated Cable Row",
    "previous_en_label": "Wide-Grip Seated Cable Row",
    "id_label": "Wide-Grip Seated Row (Kabel)",
    "en_label": "Wide-Grip Seated Row (Cable)"
  }
]
$exercise_labels$::jsonb;
BEGIN
  -- Abort on drift instead of partially renaming or misclassifying an edited catalog.
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(labels) AS seed (
      mode text, id text, requirements jsonb, previous_id_label text, previous_en_label text, id_label text, en_label text
    ) LEFT JOIN exercise_catalog AS exercise ON exercise.mode::text = seed.mode AND exercise.id = seed.id
    WHERE exercise.id IS NULL OR exercise.requirements IS DISTINCT FROM seed.requirements
      OR ((exercise.id_label, exercise.en_label) IS DISTINCT FROM (seed.previous_id_label, seed.previous_en_label)
        AND (exercise.id_label, exercise.en_label) IS DISTINCT FROM (seed.id_label, seed.en_label))
  ) THEN
    RAISE EXCEPTION 'Exercise label mapping does not match the current catalog; review the mapping before migrating';
  END IF;

  -- Avoid firing the statement-level catalog version trigger on an unchanged rerun.
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(labels) AS seed (mode text, id text, id_label text, en_label text)
    JOIN exercise_catalog AS exercise ON exercise.mode::text = seed.mode AND exercise.id = seed.id
    WHERE (exercise.id_label, exercise.en_label) IS DISTINCT FROM (seed.id_label, seed.en_label)
  ) THEN
    UPDATE exercise_catalog AS exercise
    SET id_label = seed.id_label, en_label = seed.en_label, updated_at = now()
    FROM jsonb_to_recordset(labels) AS seed (mode text, id text, id_label text, en_label text)
    WHERE exercise.mode::text = seed.mode AND exercise.id = seed.id
      AND (exercise.id_label, exercise.en_label) IS DISTINCT FROM (seed.id_label, seed.en_label);
  END IF;
END
$label_migration$;
