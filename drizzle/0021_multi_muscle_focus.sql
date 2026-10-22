-- Additive migration. Keep the legacy string for old deployments/readers.
ALTER TABLE profiles ADD COLUMN focus_areas text[] NOT NULL DEFAULT '{}'::text[];
--> statement-breakpoint
-- Derive only known choices. Unknown/empty legacy values are not guessed.
-- No versions, change logs, receipts, workout snapshots or nutrition are rewritten.
UPDATE profiles SET focus_areas = ARRAY[focus]
WHERE focus IN ('full', 'leg', 'chest', 'back', 'arm');
--> statement-breakpoint
CREATE FUNCTION musmove_valid_focus_areas(areas text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT areas IS NOT NULL
    AND areas = ARRAY(SELECT value FROM unnest(ARRAY['full','leg','chest','back','arm']::text[]) value WHERE value = ANY(areas))
    AND cardinality(areas) <= 4
    AND (NOT ('full' = ANY(areas)) OR areas = ARRAY['full']::text[])
$$;
--> statement-breakpoint
ALTER TABLE profiles ADD CONSTRAINT profiles_focus_areas CHECK (musmove_valid_focus_areas(focus_areas));
--> statement-breakpoint
-- Bridge old server deployments that still write only the string during rollout.
-- An actual array change always wins. An unrelated old-client edit cannot clear it.
CREATE FUNCTION musmove_legacy_focus_write() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND cardinality(NEW.focus_areas) = 0)
    OR (TG_OP = 'UPDATE' AND NEW.focus IS DISTINCT FROM OLD.focus AND NEW.focus_areas IS NOT DISTINCT FROM OLD.focus_areas) THEN
    NEW.focus_areas := CASE WHEN NEW.focus IN ('full','leg','chest','back','arm') THEN ARRAY[NEW.focus] ELSE '{}'::text[] END;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.focus_areas IS DISTINCT FROM OLD.focus_areas THEN
    NEW.focus := CASE WHEN cardinality(NEW.focus_areas) = 1 THEN NEW.focus_areas[1] ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER profiles_legacy_focus_write BEFORE INSERT OR UPDATE OF focus, focus_areas
ON profiles FOR EACH ROW EXECUTE FUNCTION musmove_legacy_focus_write();
