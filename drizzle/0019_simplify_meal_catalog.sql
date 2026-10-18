-- Deploy code that no longer selects these columns BEFORE applying this migration.
-- Only meal_catalog changes; meal_entries.meal_type and historical snapshots remain intact.
ALTER TABLE meal_catalog
  DROP CONSTRAINT meal_catalog_reference_metadata,
  DROP CONSTRAINT meal_catalog_type,
  DROP CONSTRAINT meal_catalog_food_kind,
  DROP COLUMN meal_type,
  DROP COLUMN portion_label,
  DROP COLUMN food_kind,
  ADD CONSTRAINT meal_catalog_reference_metadata CHECK (
    source_type <> 'reference' OR (
      num_nonnulls(portion_grams, food_group, source_code, source_checked_at, source_details) = 5
      AND length(trim(source_code)) > 0
      AND length(trim(source_url)) > 0
    )
  );
--> statement-breakpoint
-- DDL does not fire the catalog's DML trigger. Invalidate cached catalog responses explicitly.
UPDATE catalog_state SET version = version + 1 WHERE name = 'meals';
