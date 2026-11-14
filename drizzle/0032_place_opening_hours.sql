-- Opening hours supplied by the project owner; all times are WIB (Asia/Jakarta).
-- Keep unknown hours null instead of inferring schedules for other places.
ALTER TABLE place_catalog ADD COLUMN opening_hours varchar(500),
  ADD CONSTRAINT place_catalog_opening_hours CHECK (
    opening_hours IS NULL OR length(trim(opening_hours)) > 0
  );
--> statement-breakpoint
-- Existing triggers bump each changed row and the shared catalog version.
UPDATE place_catalog SET opening_hours = CASE lower(brand)
  WHEN 'ftl' THEN '24 jam'
  WHEN 'fithub' THEN 'Senin–Jumat: 05.00–00.00; Sabtu, Minggu, dan libur nasional: 06.00–21.00'
END
WHERE mode = 'gym' AND lower(brand) IN ('ftl', 'fithub');
