import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { getPool } = await import("../src/db/client");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN READ ONLY");
    const places = (await client.query(`SELECT count(*)::int AS entries,
      count(*) FILTER (WHERE trim(address)='' OR latitude NOT BETWEEN -90 AND 90 OR longitude NOT BETWEEN -180 AND 180 OR google_maps_url NOT LIKE 'https://www.google.com/maps/%' OR jsonb_array_length(sources)=0)::int AS invalid,
      count(*) FILTER (WHERE day_pass_available IS NULL)::int AS unknown_day_pass,
      count(*) FILTER (WHERE access_model IN ('per_visit','membership_or_per_visit') AND day_pass_available IS DISTINCT FROM true)::int AS inconsistent_access,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(sources) s WHERE
        coalesce(s->>'url','') !~ '^https://[^[:space:]]+$' OR coalesce(s->>'kind','') NOT IN ('operator','publisher','map','community')
        OR CASE WHEN jsonb_typeof(s->'fields')='array' THEN jsonb_array_length(s->'fields') ELSE 0 END=0
        OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(s->'fields')='array' THEN s->'fields' ELSE '[]'::jsonb END) f
          WHERE f NOT IN ('identity','location','access'))))::int AS malformed_sources,
      min(checked_at)::text AS oldest_checked_at, max(checked_at)::text AS newest_checked_at FROM place_catalog WHERE active`)).rows[0];
    const exercises = (await client.query(`SELECT count(*)::int AS entries, count(*) FILTER (WHERE movement_tags IS NULL OR cardinality(movement_tags)=0)::int AS missing_tags FROM exercise_catalog WHERE active`)).rows[0];
    await client.query("ROLLBACK");
    console.info(JSON.stringify({ mode: "read-only", places, exercises,
      limitations: ["Source presence does not verify current operator access/hours/prices", "Gym prices/hours/facilities are not modeled"] }, null, 2));
    if (places.invalid || places.inconsistent_access || places.malformed_sources || exercises.missing_tags) process.exitCode = 1;
  } finally { client.release(); await getPool().end(); }
}
void main().catch(() => { console.error("Catalog audit failed; connection details withheld"); process.exitCode = 1; });
