-- Additive migration: old deployed APIs can continue selecting their original columns.
ALTER TABLE equipment_catalog ADD COLUMN modes text[];
--> statement-breakpoint
-- Product taxonomy of training use, not a claim that equipment is available at every gym/park.
-- Shared accessories have both modes; never duplicate canonical equipment IDs.
UPDATE equipment_catalog AS equipment SET modes = classification.modes
FROM (VALUES
  ('assisted_pullup_machine', ARRAY['gym']::text[]),
  ('barbell', ARRAY['gym']::text[]),
  ('bench', ARRAY['gym','calisthenics']::text[]),
  ('cable_machine', ARRAY['gym']::text[]),
  ('chair', ARRAY['gym','calisthenics']::text[]),
  ('chest_press_machine', ARRAY['gym']::text[]),
  ('chest_supported_row_machine', ARRAY['gym']::text[]),
  ('decline_chest_press_machine', ARRAY['gym']::text[]),
  ('dumbbell', ARRAY['gym']::text[]),
  ('high_row_machine', ARRAY['gym']::text[]),
  ('incline_chest_press_machine', ARRAY['gym']::text[]),
  ('iso_lateral_row_machine', ARRAY['gym']::text[]),
  ('landmine', ARRAY['gym']::text[]),
  ('lat_pulldown_machine', ARRAY['gym']::text[]),
  ('leg_curl_machine', ARRAY['gym']::text[]),
  ('leg_extension_machine', ARRAY['gym']::text[]),
  ('leg_press_machine', ARRAY['gym']::text[]),
  ('low_bar', ARRAY['calisthenics']::text[]),
  ('low_row_machine', ARRAY['gym']::text[]),
  ('parallel_bars', ARRAY['gym','calisthenics']::text[]),
  ('pec_deck_machine', ARRAY['gym']::text[]),
  ('pull_up_bar', ARRAY['gym','calisthenics']::text[]),
  ('pullover_machine', ARRAY['gym']::text[]),
  ('resistance_band', ARRAY['gym','calisthenics']::text[]),
  ('rings', ARRAY['calisthenics']::text[]),
  ('smith_machine', ARRAY['gym']::text[]),
  ('squat_rack', ARRAY['gym']::text[]),
  ('mat', ARRAY['gym','calisthenics']::text[])
) AS classification(id, modes) WHERE equipment.id = classification.id;
--> statement-breakpoint
-- No default: new equipment must be deliberately classified. Unknown existing IDs fail closed.
ALTER TABLE equipment_catalog ALTER COLUMN modes SET NOT NULL,
  ADD CONSTRAINT equipment_catalog_modes CHECK (
    modes IN (ARRAY['gym']::text[], ARRAY['calisthenics']::text[], ARRAY['gym','calisthenics']::text[])
  );
