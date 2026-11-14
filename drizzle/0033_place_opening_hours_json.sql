-- Convert the previously applied display strings to bilingual schedule entries.
-- Fail rather than discard an unexpected schedule added since migration 0032.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM place_catalog WHERE opening_hours IS NOT NULL AND opening_hours NOT IN (
      '24 jam',
      'Senin–Jumat: 05.00–00.00; Sabtu, Minggu, dan libur nasional: 06.00–21.00'
    )
  ) THEN
    RAISE EXCEPTION 'Unexpected opening hours text; map existing schedules before applying migration 0033';
  END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.valid_place_opening_hours(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  entry jsonb;
  field text;
BEGIN
  IF jsonb_typeof(value) <> 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(value) = 0 THEN RETURN false; END IF;
  FOR entry IN SELECT jsonb_array_elements(value) LOOP
    IF jsonb_typeof(entry) <> 'object' THEN RETURN false; END IF;
    IF entry - ARRAY['labelID', 'labelEN', 'hours'] <> '{}'::jsonb THEN RETURN false; END IF;
    FOREACH field IN ARRAY ARRAY['labelID', 'labelEN', 'hours'] LOOP
      IF jsonb_typeof(entry->field) IS DISTINCT FROM 'string'
        OR length(trim(entry->>field)) = 0 THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN true;
END $$;
--> statement-breakpoint
ALTER TABLE place_catalog DROP CONSTRAINT place_catalog_opening_hours;
--> statement-breakpoint
ALTER TABLE place_catalog ALTER COLUMN opening_hours TYPE jsonb USING CASE
  WHEN opening_hours IS NULL THEN NULL::jsonb
  WHEN opening_hours = '24 jam' THEN
    '[{"labelID":"Setiap Hari","labelEN":"All Day","hours":"24 jam"}]'::jsonb
  WHEN opening_hours = 'Senin–Jumat: 05.00–00.00; Sabtu, Minggu, dan libur nasional: 06.00–21.00' THEN
    '[{"labelID":"Senin - Jumat","labelEN":"Monday - Friday","hours":"05.00 - 00.00"},
      {"labelID":"Sabtu, Minggu dan Libur Nasional","labelEN":"Saturday, Sunday and Public Holidays","hours":"06.00 - 21.00"}]'::jsonb
  ELSE opening_hours::jsonb
END;
--> statement-breakpoint
ALTER TABLE place_catalog ADD CONSTRAINT place_catalog_opening_hours CHECK (
  opening_hours IS NULL OR public.valid_place_opening_hours(opening_hours)
);
--> statement-breakpoint
-- Existing triggers refresh each changed row and the shared catalog version.
UPDATE place_catalog SET opening_hours = opening_hours WHERE opening_hours IS NOT NULL;
