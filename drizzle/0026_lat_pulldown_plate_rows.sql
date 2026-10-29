-- Distinct equipment classifications preserve the existing cable-machine ID.
INSERT INTO equipment_catalog (id, name, aliases, modes) VALUES
  ('lat_pulldown_standard_machine', 'Standard Lat Pulldown Machine', ARRAY['standard lat pulldown machine','mesin lat pulldown standar'], ARRAY['gym']),
  ('lat_pulldown_plate_loaded_machine', 'Plate-Loaded Lat Pulldown Machine', ARRAY['lat pulldown plate loaded','mesin lat pulldown plate loaded'], ARRAY['gym']),
  ('iso_lateral_row_plate_loaded_machine', 'Plate-Loaded Iso-Lateral Row Machine', ARRAY['iso lateral row plate loaded','mesin iso lateral row plate loaded'], ARRAY['gym']),
  ('high_iso_lateral_row_plate_loaded_machine', 'Plate-Loaded High Iso-Lateral Row Machine', ARRAY['high iso lateral row plate loaded','mesin high iso lateral row plate loaded'], ARRAY['gym'])
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
-- Existing matching IDs/names are left untouched, including their active state.
WITH requested(id, label, equipment_id, tags, primary_muscles, secondary_muscles) AS (VALUES
  ('lat_pulldown_cable_machine', 'Lat Pulldown Cable Machine', 'lat_pulldown_machine', ARRAY['shoulder','elbow','wrist','back','overhead_reach'], ARRAY['lats'], ARRAY['biceps','upperBack']),
  ('lat_pulldown_machine', 'Lat Pulldown Machine', 'lat_pulldown_standard_machine', ARRAY['shoulder','elbow','wrist','back','overhead_reach'], ARRAY['lats'], ARRAY['biceps','upperBack']),
  ('lat_pulldown_plate_loaded', 'Lat Pulldown Plate Loaded', 'lat_pulldown_plate_loaded_machine', ARRAY['shoulder','elbow','wrist','back','overhead_reach'], ARRAY['lats'], ARRAY['biceps','upperBack']),
  ('iso_lateral_row_plate_loaded', 'Iso Lateral Row Plate Loaded', 'iso_lateral_row_plate_loaded_machine', ARRAY['shoulder','elbow','wrist','back'], ARRAY['upperBack','lats'], ARRAY['biceps','shoulders']),
  ('high_iso_lateral_row_plate_loaded', 'High Iso Lateral Row Plate Loaded', 'high_iso_lateral_row_plate_loaded_machine', ARRAY['shoulder','elbow','wrist','back','overhead_reach'], ARRAY['upperBack','lats'], ARRAY['biceps','shoulders'])
)
INSERT INTO exercise_catalog (id, mode, id_label, en_label, default_sets, default_reps, requirements, movement_tags, tracking_type, muscle_targets)
SELECT requested.id, 'gym', requested.label, requested.label, 3, 10,
  jsonb_build_array(jsonb_build_array(requested.equipment_id)), requested.tags, 'repetitions',
  jsonb_build_object('version','1','primary',requested.primary_muscles,'secondary',requested.secondary_muscles)
FROM requested
WHERE NOT EXISTS (
  SELECT 1 FROM exercise_catalog existing WHERE existing.mode='gym'
    AND (existing.id=requested.id OR lower(trim(existing.en_label))=lower(trim(requested.label)))
)
ON CONFLICT (mode,id) DO NOTHING;
--> statement-breakpoint
-- Hide the two requested exercises from discovery without breaking saved
-- prescriptions, workout history, or canonicalization of completed snapshots.
UPDATE exercise_catalog SET active=false
WHERE mode='gym' AND id IN ('high_row_machine','iso_lateral_row_machine') AND active=true;
