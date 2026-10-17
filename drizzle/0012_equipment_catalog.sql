CREATE TABLE equipment_catalog (
  id varchar(80) PRIMARY KEY,
  name varchar(120) NOT NULL,
  aliases text[] NOT NULL,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipment_catalog_id CHECK (id ~ '^[a-z][a-z0-9_]{0,79}$'),
  CONSTRAINT equipment_catalog_name CHECK (length(trim(name)) > 0),
  CONSTRAINT equipment_catalog_aliases CHECK (cardinality(aliases) > 0 AND array_ndims(aliases) = 1 AND array_position(aliases, NULL) IS NULL AND NOT (aliases @> ARRAY['']::text[]))
);
--> statement-breakpoint
INSERT INTO equipment_catalog (id, name, aliases)
SELECT id, name, aliases FROM jsonb_to_recordset($equipment$
[
  {
    "id": "assisted_pullup_machine",
    "name": "Assisted Pull-Up Machine",
    "aliases": [
      "mesin pull up bantuan",
      "assisted pull up",
      "assisted pullup machine"
    ]
  },
  {
    "id": "barbell",
    "name": "Barbell",
    "aliases": [
      "barbel",
      "barbell bar"
    ]
  },
  {
    "id": "bench",
    "name": "Workout Bench",
    "aliases": [
      "bench",
      "bangku latihan",
      "bangku beban",
      "weight bench"
    ]
  },
  {
    "id": "cable_machine",
    "name": "Cable Machine",
    "aliases": [
      "mesin kabel",
      "cable crossover",
      "cable station",
      "functional trainer"
    ]
  },
  {
    "id": "chair",
    "name": "Chair",
    "aliases": [
      "kursi",
      "stable chair"
    ]
  },
  {
    "id": "chest_press_machine",
    "name": "Chest Press Machine",
    "aliases": [
      "mesin chest press",
      "mesin press dada",
      "seated chest press"
    ]
  },
  {
    "id": "chest_supported_row_machine",
    "name": "Chest-Supported Row Machine",
    "aliases": [
      "mesin row dengan penyangga dada",
      "chest supported row"
    ]
  },
  {
    "id": "decline_chest_press_machine",
    "name": "Decline Chest Press Machine",
    "aliases": [
      "mesin decline chest press",
      "decline chest press"
    ]
  },
  {
    "id": "dumbbell",
    "name": "Dumbbell",
    "aliases": [
      "dumbell",
      "halter",
      "dambel",
      "dumbel"
    ]
  },
  {
    "id": "high_row_machine",
    "name": "High Row Machine",
    "aliases": [
      "mesin high row",
      "high row"
    ]
  },
  {
    "id": "incline_chest_press_machine",
    "name": "Incline Chest Press Machine",
    "aliases": [
      "mesin incline chest press",
      "incline chest press"
    ]
  },
  {
    "id": "iso_lateral_row_machine",
    "name": "Iso-Lateral Row Machine",
    "aliases": [
      "mesin iso lateral row",
      "iso lateral row"
    ]
  },
  {
    "id": "landmine",
    "name": "Barbell Landmine Attachment",
    "aliases": [
      "landmine",
      "landmine attachment",
      "landmine base"
    ]
  },
  {
    "id": "lat_pulldown_machine",
    "name": "Lat Pulldown Machine",
    "aliases": [
      "mesin lat pulldown",
      "lat pull down",
      "lat pulldown"
    ]
  },
  {
    "id": "leg_curl_machine",
    "name": "Leg Curl Machine",
    "aliases": [
      "mesin leg curl",
      "hamstring curl machine",
      "leg curl"
    ]
  },
  {
    "id": "leg_extension_machine",
    "name": "Leg Extension Machine",
    "aliases": [
      "mesin leg extension",
      "leg extension"
    ]
  },
  {
    "id": "leg_press_machine",
    "name": "Leg Press Machine",
    "aliases": [
      "mesin leg press",
      "leg press"
    ]
  },
  {
    "id": "low_bar",
    "name": "Low Calisthenics Bar",
    "aliases": [
      "low bar",
      "palang rendah",
      "inverted row bar"
    ]
  },
  {
    "id": "low_row_machine",
    "name": "Low Row Machine",
    "aliases": [
      "mesin low row",
      "low row"
    ]
  },
  {
    "id": "parallel_bars",
    "name": "Parallel Bars",
    "aliases": [
      "palang paralel",
      "dip bars",
      "parallel bar"
    ]
  },
  {
    "id": "pec_deck_machine",
    "name": "Pec Deck Machine",
    "aliases": [
      "pec deck",
      "mesin butterfly",
      "butterfly machine"
    ]
  },
  {
    "id": "pull_up_bar",
    "name": "Pull-Up Bar",
    "aliases": [
      "pull up bar",
      "pullup bar",
      "pullupbar",
      "palang",
      "bar tarik"
    ]
  },
  {
    "id": "pullover_machine",
    "name": "Pullover Machine",
    "aliases": [
      "mesin pullover",
      "pullover machine"
    ]
  },
  {
    "id": "resistance_band",
    "name": "Resistance Band",
    "aliases": [
      "resistance bands",
      "band resistensi",
      "karet latihan",
      "exercise band"
    ]
  },
  {
    "id": "rings",
    "name": "Gymnastic Rings",
    "aliases": [
      "rings",
      "ring senam",
      "gym rings"
    ]
  },
  {
    "id": "smith_machine",
    "name": "Smith Machine",
    "aliases": [
      "mesin smith",
      "smith"
    ]
  },
  {
    "id": "squat_rack",
    "name": "Squat Rack",
    "aliases": [
      "rak squat",
      "power rack",
      "power cage",
      "squat stand"
    ]
  },
  {
    "id": "mat",
    "name": "Exercise Mat",
    "aliases": [
      "mat",
      "matras",
      "yoga mat",
      "fitness mat"
    ]
  }
]
$equipment$::jsonb) AS seed(id text, name text, aliases text[])
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO catalog_state (name, version) VALUES ('equipment', 1);
--> statement-breakpoint
CREATE FUNCTION bump_equipment_catalog_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE catalog_state SET version = version + 1 WHERE name = 'equipment';
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER equipment_catalog_version_changed AFTER INSERT OR UPDATE OR DELETE ON equipment_catalog
FOR EACH STATEMENT EXECUTE FUNCTION bump_equipment_catalog_version();
--> statement-breakpoint
CREATE FUNCTION touch_equipment_catalog_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
--> statement-breakpoint
CREATE TRIGGER equipment_catalog_row_updated BEFORE UPDATE ON equipment_catalog
FOR EACH ROW EXECUTE FUNCTION touch_equipment_catalog_row();
--> statement-breakpoint
-- Keep the existing AND/OR JSON contract while preventing new dangling keys.
CREATE FUNCTION validate_exercise_equipment_refs() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE option_group jsonb; equipment_key jsonb;
BEGIN
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
--> statement-breakpoint
CREATE TRIGGER exercise_equipment_refs_valid BEFORE INSERT OR UPDATE OF requirements ON exercise_catalog
FOR EACH ROW EXECUTE FUNCTION validate_exercise_equipment_refs();
--> statement-breakpoint
CREATE FUNCTION protect_referenced_equipment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.id = OLD.id THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM exercise_catalog, jsonb_array_elements(requirements) AS option_group(value)
    WHERE option_group.value @> to_jsonb(ARRAY[OLD.id])
  ) THEN RAISE EXCEPTION 'Equipment is referenced by exercises; deactivate instead' USING ERRCODE = '23503'; END IF;
  IF TG_OP = 'UPDATE' THEN RETURN NEW; ELSE RETURN OLD; END IF;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER equipment_catalog_reference_protection BEFORE DELETE OR UPDATE OF id ON equipment_catalog
FOR EACH ROW EXECUTE FUNCTION protect_referenced_equipment();
