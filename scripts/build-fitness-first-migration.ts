// Offline generator for the nine owner-requested Fitness First club schedules.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const data = JSON.parse(readFileSync("src/db/data/fitness-first-jakarta-2026-11-14.json", "utf8"));
const columns = ["id", "name", "mode", "gym_category", "brand", "access_model", "day_pass_available", "area", "city", "address", "latitude", "longitude", "google_maps_url", "sources", "checked_at", "opening_hours"];
const places = data.places as Record<string, unknown>[];
assert.equal(places.length, 9);
assert.equal(new Set(places.map(p => p.id)).size, 9);
assert.ok(places.every(p => p.brand === "fitness_first"));
const payload = JSON.stringify(places.map(p => Object.fromEntries(columns.map(c => [c, p[c]]))), null, 2);
assert.ok(!payload.includes("$fitness_first$"));
const update = ["name", "city", "address", "latitude", "longitude", "google_maps_url", "sources", "checked_at", "opening_hours"];
writeFileSync("drizzle/0035_fitness_first_jakarta.sql", `-- Nine Fitness First branches requested by the owner, checked ${data.checkedAt}.
-- Opening hours follow the supplied screenshot, including Oakwood Sunday/PH closure.
-- Coordinates are venue pins linked by the official club pages. Keep existing IDs/favorites.
INSERT INTO place_catalog (${columns.join(", ")})
SELECT id, name, mode::training_mode, gym_category, brand, access_model,
  day_pass_available, area, city, address, latitude, longitude, google_maps_url,
  sources, checked_at, opening_hours
FROM jsonb_to_recordset($fitness_first$
${payload}
$fitness_first$::jsonb) AS seed (
  id text, name text, mode text, gym_category text, brand text, access_model text,
  day_pass_available boolean, area text, city text, address text, latitude numeric,
  longitude numeric, google_maps_url text, sources jsonb, checked_at date, opening_hours jsonb
)
ON CONFLICT (id) DO UPDATE SET
  ${update.map(c => `${c} = EXCLUDED.${c}`).join(",\n  ")}
WHERE (${update.map(c => `place_catalog.${c}`).join(", ")})
  IS DISTINCT FROM (${update.map(c => `EXCLUDED.${c}`).join(", ")});
`);
console.info("Generated Fitness First migration: nine clubs with three schedule entries each");
