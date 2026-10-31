INSERT INTO equipment_catalog (id, name, aliases, modes) VALUES
  ('lateral_raise_machine', 'Lateral Raise Machine', ARRAY['lateral raise machine','mesin lateral raise'], ARRAY['gym']),
  ('plate_loaded_lateral_raise_machine', 'Plate-Loaded Lateral Raise Machine', ARRAY['plate loaded lateral raise','mesin lateral raise plate loaded'], ARRAY['gym']),
  ('plate_loaded_t_bar_row_machine', 'Plate-Loaded T-Bar Row Machine', ARRAY['plate loaded t bar row','mesin t bar row plate loaded'], ARRAY['gym']),
  ('plate_loaded_chest_supported_t_bar_row_machine', 'Plate-Loaded Chest-Supported T-Bar Row Machine', ARRAY['plate loaded chest supported t bar row','mesin t bar row dengan penyangga dada'], ARRAY['gym'])
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
-- Clarify the existing dumbbell exercise while preserving its stable ID.
UPDATE exercise_catalog SET id_label='Dumbbell Lateral Raise', en_label='Dumbbell Lateral Raise'
WHERE mode='gym' AND id='raise' AND active=true AND en_label='Lateral raise'
  AND requirements='[["dumbbell"]]'::jsonb
  AND NOT EXISTS (SELECT 1 FROM exercise_catalog e WHERE e.mode='gym' AND e.id <> 'raise' AND lower(trim(e.en_label))='dumbbell lateral raise');
--> statement-breakpoint
WITH requested(id, label, equipment_id, tags, primary_muscles, secondary_muscles) AS (VALUES
  ('single_arm_cable_triceps_pushdown', 'Single-Arm Cable Triceps Pushdown', 'cable_machine', ARRAY['shoulder','elbow','wrist'], ARRAY['triceps'], ARRAY[]::text[]),
  ('single_arm_overhead_cable_triceps_extension', 'Single-Arm Overhead Cable Triceps Extension', 'cable_machine', ARRAY['shoulder','elbow','wrist','overhead_reach'], ARRAY['triceps'], ARRAY[]::text[]),
  ('overhead_cable_triceps_extension', 'Overhead Cable Triceps Extension', 'cable_machine', ARRAY['shoulder','elbow','wrist','overhead_reach'], ARRAY['triceps'], ARRAY[]::text[]),
  ('cable_triceps_pushdown', 'Cable Triceps Pushdown', 'cable_machine', ARRAY['shoulder','elbow','wrist'], ARRAY['triceps'], ARRAY[]::text[]),
  ('single_arm_dumbbell_lateral_raise', 'Single-Arm Dumbbell Lateral Raise', 'dumbbell', ARRAY['shoulder','elbow','wrist'], ARRAY['shoulders'], ARRAY[]::text[]),
  ('plate_loaded_lateral_raise', 'Plate-Loaded Lateral Raise', 'plate_loaded_lateral_raise_machine', ARRAY['shoulder','elbow','wrist'], ARRAY['shoulders'], ARRAY[]::text[]),
  ('seated_plate_loaded_lateral_raise', 'Seated Plate-Loaded Lateral Raise', 'plate_loaded_lateral_raise_machine', ARRAY['shoulder','elbow','wrist'], ARRAY['shoulders'], ARRAY[]::text[]),
  ('machine_lateral_raise', 'Machine Lateral Raise', 'lateral_raise_machine', ARRAY['shoulder','elbow','wrist'], ARRAY['shoulders'], ARRAY[]::text[]),
  ('seated_machine_lateral_raise', 'Seated Machine Lateral Raise', 'lateral_raise_machine', ARRAY['shoulder','elbow','wrist'], ARRAY['shoulders'], ARRAY[]::text[]),
  ('cable_lateral_raise', 'Cable Lateral Raise', 'cable_machine', ARRAY['shoulder','elbow','wrist'], ARRAY['shoulders'], ARRAY[]::text[]),
  ('single_arm_cable_lateral_raise', 'Single-Arm Cable Lateral Raise', 'cable_machine', ARRAY['shoulder','elbow','wrist'], ARRAY['shoulders'], ARRAY[]::text[]),
  ('plate_loaded_t_bar_row', 'Plate-Loaded T-Bar Row', 'plate_loaded_t_bar_row_machine', ARRAY['shoulder','elbow','wrist','back','hip'], ARRAY['upperBack','lats'], ARRAY['biceps','shoulders']),
  ('plate_loaded_chest_supported_t_bar_row', 'Plate-Loaded Chest-Supported T-Bar Row', 'plate_loaded_chest_supported_t_bar_row_machine', ARRAY['shoulder','elbow','wrist','back'], ARRAY['upperBack','lats'], ARRAY['biceps','shoulders'])
)
INSERT INTO exercise_catalog (id, mode, id_label, en_label, default_sets, default_reps, requirements, movement_tags, tracking_type, muscle_targets)
SELECT requested.id, 'gym', requested.label, requested.label, 3, 10,
  jsonb_build_array(jsonb_build_array(requested.equipment_id)), requested.tags, 'repetitions',
  jsonb_build_object('version','1','primary',requested.primary_muscles,'secondary',requested.secondary_muscles)
FROM requested
WHERE NOT EXISTS (SELECT 1 FROM exercise_catalog existing WHERE existing.mode='gym'
  AND (existing.id=requested.id OR lower(trim(existing.en_label))=lower(trim(requested.label))))
ON CONFLICT (mode,id) DO NOTHING;
