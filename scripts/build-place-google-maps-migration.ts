// Offline generator: reviewed identity evidence lives beside the catalog data.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const data = JSON.parse(readFileSync("src/db/data/place-google-maps-2026-11-14.json", "utf8"));
interface LinkUpdate {
  id: string;
  previousGoogleMapsUrl: string;
  googleMapsUrl: string;
  resolution: string;
  cid?: string;
  featureId?: string;
  sourcesToAdd: { url: string; kind: string; fields: string[] }[];
}
const places = data.places as LinkUpdate[];
assert.equal(places.length, 104);
assert.equal(new Set(places.map(p => p.id)).size, places.length);
assert.equal(places.filter(p => p.resolution === "profile").length, 101);
const fallbackIds = new Set(["jakarta-ftl-permata-hijau", "jakarta-gbk-gate-vii", "jakarta-gbk-monkey-bar"]);
for (const place of places) {
  const before = new URL(place.previousGoogleMapsUrl), after = new URL(place.googleMapsUrl);
  assert.match(before.searchParams.get("query") ?? "", /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/);
  assert.equal(after.origin, "https://www.google.com");
  if (place.resolution === "profile") {
    assert.match(place.cid ?? "", /^[1-9]\d*$/);
    assert.equal(BigInt(place.featureId!.split(":")[1]).toString(), place.cid);
    assert.equal(place.googleMapsUrl, `https://www.google.com/maps/?cid=${place.cid}`);
  } else {
    assert.equal(place.resolution, "name_address_search");
    assert.ok(fallbackIds.has(place.id));
    assert.equal(after.pathname, "/maps/search/");
    assert.equal(after.searchParams.get("api"), "1");
    assert.ok((after.searchParams.get("query") ?? "").length > 20);
  }
}
const payload = JSON.stringify(places.map(p => ({
  id: p.id, previous_google_maps_url: p.previousGoogleMapsUrl,
  google_maps_url: p.googleMapsUrl, sources: p.sourcesToAdd,
})), null, 2);
assert.ok(!payload.includes("$place_map_links$"));
writeFileSync("drizzle/0037_place_google_maps_profiles.sql", `-- Reviewed Google Maps identity links, checked ${data.checkedAt}.
-- 101 verified profile CIDs; 3 explicit name/address searches awaiting a verified profile.
-- Preserve the existing Musclebound CID, place attributes, coordinates and favorites.
-- Match the previous coordinate URL so a later manually corrected link is never overwritten.
-- Skip the UPDATE statement entirely when nothing matches (catalog triggers are statement-level).
DO $maps_migration$
DECLARE
  links jsonb := $place_map_links$
${payload}
$place_map_links$::jsonb;
BEGIN
IF EXISTS (
  SELECT 1 FROM place_catalog AS place
  JOIN jsonb_to_recordset(links) AS seed (
    id text, previous_google_maps_url text, google_maps_url text
  ) ON place.id = seed.id
  WHERE place.google_maps_url = seed.previous_google_maps_url
    AND place.google_maps_url IS DISTINCT FROM seed.google_maps_url
) THEN
UPDATE place_catalog AS place
SET google_maps_url = seed.google_maps_url,
    sources = place.sources || COALESCE((
      SELECT jsonb_agg(candidate.value)
      FROM jsonb_array_elements(seed.sources) AS candidate(value)
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(place.sources) AS existing(value)
        WHERE existing.value->>'url' = candidate.value->>'url'
      )
    ), '[]'::jsonb)
FROM jsonb_to_recordset(links) AS seed (
  id text, previous_google_maps_url text, google_maps_url text, sources jsonb
)
WHERE place.id = seed.id
  AND place.google_maps_url = seed.previous_google_maps_url
  AND place.google_maps_url IS DISTINCT FROM seed.google_maps_url;
END IF;
END
$maps_migration$;
`);
console.info("Generated Google Maps link migration: 101 profiles and 3 name/address searches");
