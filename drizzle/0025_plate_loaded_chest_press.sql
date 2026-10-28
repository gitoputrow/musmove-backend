-- The angle-specific machine is required, not merely a generic weight plate.
INSERT INTO equipment_catalog (id, name, aliases, modes) VALUES
  ('incline_plate_loaded_chest_press_machine', 'Incline Plate-Loaded Chest Press Machine', ARRAY['incline plate loaded chest press','mesin incline chest press plate loaded'], ARRAY['gym']),
  ('plate_loaded_chest_press_machine', 'Plate-Loaded Chest Press Machine', ARRAY['plate loaded chest press','mesin chest press plate loaded'], ARRAY['gym']),
  ('decline_plate_loaded_chest_press_machine', 'Decline Plate-Loaded Chest Press Machine', ARRAY['decline plate loaded chest press','mesin decline chest press plate loaded'], ARRAY['gym'])
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
-- Preserve existing IDs and labels; do not create a duplicate by normalized name.
WITH requested(id, label, equipment_id) AS (VALUES
  ('incline_chest_press_plate_loaded', 'Incline Chest Press Plate Loaded', 'incline_plate_loaded_chest_press_machine'),
  ('chest_press_plate_loaded', 'Chest Press Plate Loaded', 'plate_loaded_chest_press_machine'),
  ('decline_chest_press_plate_loaded', 'Decline Chest Press Plate Loaded', 'decline_plate_loaded_chest_press_machine'),
  ('seated_incline_chest_press_plate_loaded', 'Seated Incline Chest Press Plate Loaded', 'incline_plate_loaded_chest_press_machine'),
  ('seated_chest_press_plate_loaded', 'Seated Chest Press Plate Loaded', 'plate_loaded_chest_press_machine'),
  ('seated_decline_chest_press_plate_loaded', 'Seated Decline Chest Press Plate Loaded', 'decline_plate_loaded_chest_press_machine')
)
INSERT INTO exercise_catalog (id, mode, id_label, en_label, default_sets, default_reps, requirements, movement_tags, tracking_type, muscle_targets)
SELECT requested.id, 'gym', requested.label, requested.label, 3, 10,
  jsonb_build_array(jsonb_build_array(requested.equipment_id)), ARRAY['shoulder','elbow','wrist'], 'repetitions',
  jsonb_build_object('version','1','primary',ARRAY['chest'],'secondary',ARRAY['shoulders','triceps'])
FROM requested
WHERE NOT EXISTS (
  SELECT 1 FROM exercise_catalog existing WHERE existing.mode='gym'
    AND (existing.id=requested.id OR lower(trim(existing.en_label))=lower(trim(requested.label)))
)
ON CONFLICT (mode,id) DO NOTHING;
