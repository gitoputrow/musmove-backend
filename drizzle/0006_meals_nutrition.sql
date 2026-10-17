CREATE TABLE meal_catalog (
  id varchar(255) PRIMARY KEY,
  id_label varchar(120) NOT NULL,
  en_label varchar(120) NOT NULL,
  meal_type varchar(20) NOT NULL CONSTRAINT meal_catalog_type CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  portion_label varchar(120) NOT NULL,
  calories_kcal numeric(10,2) NOT NULL,
  protein_grams numeric(10,2) NOT NULL,
  sample_price_rupiah integer CONSTRAINT meal_catalog_price CHECK (sample_price_rupiah IS NULL OR sample_price_rupiah >= 0),
  source_type varchar(20) NOT NULL,
  source_note text NOT NULL,
  source_url text,
  active boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1 CONSTRAINT meal_catalog_version CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meal_catalog_nutrients CHECK (calories_kcal BETWEEN 0 AND 10000 AND protein_grams BETWEEN 0 AND 1000),
  CONSTRAINT meal_catalog_source CHECK (source_type IN ('demo', 'reference') AND (source_type = 'demo' OR source_url IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO meal_catalog (id, id_label, en_label, meal_type, portion_label, calories_kcal, protein_grams, sample_price_rupiah, source_type, source_note) VALUES
('demo-oats-banana-milk', 'Oat, pisang & susu', 'Oats, banana & milk', 'breakfast', '1 porsi contoh / example serving', 380, 18, 12000, 'demo', 'Existing Flutter meal_budget_summary.dart demo. No measured ingredient weights; nutrition and price are illustrative, not verified.'),
('demo-rice-chicken-vegetables', 'Nasi, ayam & sayuran', 'Rice, chicken & vegetables', 'lunch', '1 porsi contoh / example serving', 560, 35, 20000, 'demo', 'Existing Flutter meal_budget_summary.dart demo. No measured ingredient weights; nutrition and price are illustrative, not verified.'),
('demo-tempeh-eggs-rice', 'Tempe, telur & nasi', 'Tempeh, eggs & rice', 'dinner', '1 porsi contoh / example serving', 490, 28, 13000, 'demo', 'Existing Flutter meal_budget_summary.dart demo. No measured ingredient weights; nutrition and price are illustrative, not verified.');
--> statement-breakpoint
INSERT INTO catalog_state (name, version) VALUES ('meals', 1);
--> statement-breakpoint
CREATE FUNCTION update_meal_catalog_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER meal_catalog_row_updated BEFORE UPDATE ON meal_catalog
FOR EACH ROW EXECUTE FUNCTION update_meal_catalog_row();
--> statement-breakpoint
CREATE FUNCTION bump_meal_catalog_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE catalog_state SET version = version + 1 WHERE name = 'meals';
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER meal_catalog_version_changed AFTER INSERT OR UPDATE OR DELETE ON meal_catalog
FOR EACH STATEMENT EXECUTE FUNCTION bump_meal_catalog_version();
--> statement-breakpoint
ALTER TABLE meal_entries
  ADD COLUMN catalog_id varchar(255),
  ADD COLUMN servings numeric(6,2),
  ADD COLUMN consumed_at timestamptz,
  ADD COLUMN recorded_on date,
  ADD COLUMN meal_type varchar(20),
  ADD COLUMN nutrition_per_serving jsonb,
  ADD COLUMN calories_kcal numeric(12,2),
  ADD COLUMN protein_grams numeric(12,2),
  ADD CONSTRAINT meal_entries_structured CHECK (
    (num_nonnulls(servings, consumed_at, recorded_on, meal_type, nutrition_per_serving, catalog_id, calories_kcal, protein_grams) = 0)
    OR (num_nonnulls(servings, consumed_at, recorded_on, meal_type, nutrition_per_serving, calories_kcal, protein_grams) = 7
      AND servings BETWEEN 0.01 AND 20
      AND meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')
      AND jsonb_typeof(nutrition_per_serving) = 'object'
      AND calories_kcal BETWEEN 0 AND 200000 AND protein_grams BETWEEN 0 AND 20000)
  );
--> statement-breakpoint
CREATE INDEX meal_entries_daily_idx ON meal_entries (user_id, recorded_on);
--> statement-breakpoint
CREATE TABLE nutrition_estimates (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_version bigint NOT NULL CONSTRAINT nutrition_estimates_version CHECK (profile_version > 0),
  formula_version varchar(80) NOT NULL,
  status varchar(30) NOT NULL CONSTRAINT nutrition_estimates_status CHECK (status IN ('ready', 'incomplete', 'unsupportedAge', 'needsReview')),
  input_snapshot jsonb NOT NULL,
  reason_codes text[] NOT NULL,
  resting_kcal numeric(12,4),
  calories integer,
  protein_grams integer,
  protein_min integer,
  protein_max integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, profile_version, formula_version),
  CONSTRAINT nutrition_estimates_values CHECK (
    (status = 'ready' AND num_nonnulls(resting_kcal, calories, protein_grams, protein_min, protein_max) = 5
      AND resting_kcal > 0 AND calories > 0 AND protein_grams > 0 AND protein_min > 0 AND protein_max >= protein_min)
    OR (status <> 'ready' AND num_nonnulls(resting_kcal, calories, protein_grams, protein_min, protein_max) = 0)
  )
);
