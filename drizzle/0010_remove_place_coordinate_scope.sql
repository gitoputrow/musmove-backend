-- Remove the requested metadata only; coordinates, places and favorites remain intact.
-- Original seeded scope values remain in historical migration 0008.
ALTER TABLE place_catalog DROP COLUMN coordinate_scope;
--> statement-breakpoint
-- The representation changed for every place. Existing row/statement triggers
-- advance row versions and the global catalog version so clients refresh caches.
UPDATE place_catalog SET updated_at = now();
