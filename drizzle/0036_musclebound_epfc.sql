-- Owner-supplied independent gym. accessType "both" maps to membership/per-visit.
-- Preserve the supplied Google Maps CID, using the catalog's canonical URL host.
INSERT INTO place_catalog (
  id, name, mode, gym_category, brand, access_model, day_pass_available,
  area, city, address, latitude, longitude, google_maps_url, sources,
  checked_at, opening_hours
) VALUES (
  'jakarta-musclebound-epfc', 'Musclebound EPFC', 'gym', 'conventional', NULL,
  'membership_or_per_visit', true, 'Jakarta', 'Jakarta Timur',
  'Jl. Raya Bekasi Timur KM.19 No.30, Jatinegara Kaum, Pulo Gadung, Jakarta Timur, DKI Jakarta 13930, Indonesia',
  -6.1877521, 106.9057324,
  'https://www.google.com/maps/?cid=13462237417293359381',
  '[{"url":"https://maps.google.com/?cid=13462237417293359381","kind":"map","fields":["identity","location"]}]'::jsonb,
  '2026-11-14',
  '[{"labelID":"Senin - Jumat","labelEN":"Monday - Friday","hours":"06.00 - 23.30"},
    {"labelID":"Sabtu - Minggu","labelEN":"Saturday - Sunday","hours":"06.00 - 21.00"}]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  mode = EXCLUDED.mode,
  gym_category = EXCLUDED.gym_category,
  brand = EXCLUDED.brand,
  access_model = EXCLUDED.access_model,
  day_pass_available = EXCLUDED.day_pass_available,
  area = EXCLUDED.area,
  city = EXCLUDED.city,
  address = EXCLUDED.address,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  google_maps_url = EXCLUDED.google_maps_url,
  sources = EXCLUDED.sources,
  checked_at = EXCLUDED.checked_at,
  opening_hours = EXCLUDED.opening_hours
WHERE (
  place_catalog.name, place_catalog.mode, place_catalog.gym_category, place_catalog.brand,
  place_catalog.access_model, place_catalog.day_pass_available, place_catalog.area,
  place_catalog.city, place_catalog.address, place_catalog.latitude, place_catalog.longitude,
  place_catalog.google_maps_url, place_catalog.sources, place_catalog.checked_at, place_catalog.opening_hours
) IS DISTINCT FROM (
  EXCLUDED.name, EXCLUDED.mode, EXCLUDED.gym_category, EXCLUDED.brand,
  EXCLUDED.access_model, EXCLUDED.day_pass_available, EXCLUDED.area,
  EXCLUDED.city, EXCLUDED.address, EXCLUDED.latitude, EXCLUDED.longitude,
  EXCLUDED.google_maps_url, EXCLUDED.sources, EXCLUDED.checked_at, EXCLUDED.opening_hours
);
