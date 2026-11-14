// Rebuild the reviewed, offline migration; never fetch network data here.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const data = JSON.parse(readFileSync("src/db/data/jakarta-chain-places-2026-11-14.json", "utf8"));
const columns = ["id", "name", "mode", "gym_category", "brand", "access_model", "day_pass_available", "area", "city", "address", "latitude", "longitude", "google_maps_url", "sources", "checked_at", "opening_hours"];
const places = data.places as Record<string, unknown>[];
assert.equal(places.length, 90);
assert.equal(new Set(places.map(p => p.id)).size, places.length);
for (const [brand, count] of Object.entries(data.counts)) assert.equal(places.filter(p => p.brand === brand).length, count);
const payload = JSON.stringify(places.map(p => Object.fromEntries(columns.map(c => [c, p[c]]))), null, 2);
assert.ok(!payload.includes("$jakarta_places$"));
const updateColumns = ["name", "city", "address", "latitude", "longitude", "google_maps_url", "sources", "checked_at", "opening_hours"];
const sql = `-- Reviewed official brand directories, checked ${data.checkedAt}; DKI Jakarta only.
-- 36 FIT HUB, 24 FTL-branded and 30 Anytime Fitness operating branches.
-- Excludes presales, separate Stride clubs, and locations outside DKI.
-- Keep published IDs and favorites. Refresh source-backed place details only;
-- preserve access/day-pass preferences and all non-chain catalog rows.
INSERT INTO place_catalog (${columns.join(", ")})
SELECT id, name, mode::training_mode, gym_category, brand, access_model,
  day_pass_available, area, city, address, latitude, longitude, google_maps_url,
  sources, checked_at, opening_hours
FROM jsonb_to_recordset($jakarta_places$
${payload}
$jakarta_places$::jsonb) AS seed (
  id text, name text, mode text, gym_category text, brand text, access_model text,
  day_pass_available boolean, area text, city text, address text, latitude numeric,
  longitude numeric, google_maps_url text, sources jsonb, checked_at date, opening_hours jsonb
)
ON CONFLICT (id) DO UPDATE SET
  ${updateColumns.map(c => `${c} = EXCLUDED.${c}`).join(",\n  ")}
WHERE (${updateColumns.map(c => `place_catalog.${c}`).join(", ")})
  IS DISTINCT FROM (${updateColumns.map(c => `EXCLUDED.${c}`).join(", ")});
`;
writeFileSync("drizzle/0034_complete_jakarta_chain_places.sql", sql);
console.info("Generated Jakarta chain places migration: 90 reviewed branches");
