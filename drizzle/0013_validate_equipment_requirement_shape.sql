-- Refine validation without rewriting the already-applied catalog migration.
CREATE OR REPLACE FUNCTION validate_exercise_equipment_refs() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE option_group jsonb; equipment_key jsonb;
BEGIN
  IF jsonb_typeof(NEW.requirements) <> 'array' THEN
    RAISE EXCEPTION 'Equipment requirements must be an array' USING ERRCODE = '23514';
  END IF;
  FOR option_group IN SELECT value FROM jsonb_array_elements(NEW.requirements) LOOP
    IF jsonb_typeof(option_group) <> 'array' THEN
      RAISE EXCEPTION 'Equipment requirements must contain arrays' USING ERRCODE = '23514';
    END IF;
    FOR equipment_key IN SELECT value FROM jsonb_array_elements(option_group) LOOP
      IF jsonb_typeof(equipment_key) <> 'string' OR NOT EXISTS (
        SELECT 1 FROM equipment_catalog WHERE id = equipment_key #>> '{}'
      ) THEN RAISE EXCEPTION 'Unknown equipment requirement' USING ERRCODE = '23503'; END IF;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$$;
