-- Meals and daily spending preferences have been retired. Keep historical
-- migrations intact so both existing databases and clean installs converge.
DROP TABLE meal_entries;
--> statement-breakpoint
DROP TABLE meal_catalog;
--> statement-breakpoint
DROP FUNCTION update_meal_catalog_row();
--> statement-breakpoint
DROP FUNCTION bump_meal_catalog_version();
--> statement-breakpoint
DELETE FROM catalog_state WHERE name = 'meals';
--> statement-breakpoint

ALTER TABLE user_preferences
  DROP COLUMN budget_rupiah,
  DROP COLUMN budget_is_manual;
--> statement-breakpoint

-- Remove retired data from the sync stream and successful response replays.
DELETE FROM sync_changes WHERE entity_type = 'meal_entry';
--> statement-breakpoint
UPDATE sync_changes SET payload = payload - 'budgetRupiah' - 'budgetIsManual'
WHERE entity_type = 'user_preferences' AND payload IS NOT NULL;
--> statement-breakpoint
DELETE FROM operation_receipts
WHERE result->>'entityType' = 'meal_entry'
   OR result->>'kind' LIKE 'online.v1:meal\_entry.%' ESCAPE '\';
--> statement-breakpoint
UPDATE operation_receipts
SET result = jsonb_set(result, '{response,userPreferences}',
  (result#>'{response,userPreferences}') - 'budgetRupiah' - 'budgetIsManual')
WHERE jsonb_typeof(result#>'{response,userPreferences}') = 'object';
--> statement-breakpoint

-- Existing materialized pages may contain removed fields. Force clients to
-- restart from a fresh snapshot, retaining all unrelated changes and receipts.
DELETE FROM sync_snapshots;
--> statement-breakpoint
UPDATE sync_state SET epoch = gen_random_uuid(), updated_at = now();
