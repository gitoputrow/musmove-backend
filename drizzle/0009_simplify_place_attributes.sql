-- Remove only the four attributes explicitly requested by the user.
-- area and coordinate_scope are retained pending a decision on those fields.
-- Original seeded values remain in historical migration 0008, which must not be edited.
ALTER TABLE place_catalog
  DROP COLUMN access_evidence,
  DROP COLUMN access_note,
  DROP COLUMN location_note,
  DROP COLUMN equipment;
--> statement-breakpoint
-- Remove provenance references to the removed equipment field and sources that
-- only described equipment. Updating all records invalidates every row's old
-- representation and bumps the global catalog version via the existing triggers.
UPDATE place_catalog AS place SET sources = (
  SELECT jsonb_agg(
    source.value || jsonb_build_object('fields', (source.value->'fields') - 'equipment')
    ORDER BY source.ordinality
  )
  FROM jsonb_array_elements(place.sources) WITH ORDINALITY AS source(value, ordinality)
  WHERE jsonb_array_length((source.value->'fields') - 'equipment') > 0
);
