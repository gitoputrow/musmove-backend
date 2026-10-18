import { loadEnvConfig } from "@next/env";
import { calculateFoodPrice, foodPriceDetailsSchema } from "../src/modules/meals/prices";
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
    const foods = (await client.query(`SELECT count(*)::int AS reference_entries, count(DISTINCT food_group)::int AS groups,
      count(*) FILTER (WHERE source_url IS NULL OR source_code IS NULL OR source_checked_at IS NULL OR source_details IS NULL OR portion_grams IS NULL)::int AS missing_provenance,
      count(*) FILTER (WHERE price_details->>'status'='estimated')::int AS estimated_prices,
      count(*) FILTER (WHERE price_details->>'status'='not_priced')::int AS intentionally_unpriced,
      count(*) FILTER (WHERE price_details IS NULL)::int AS missing_price_metadata
      FROM meal_catalog WHERE active AND source_type='reference'`)).rows[0];
    const priced = (await client.query("SELECT sample_price_rupiah,price_details,portion_grams FROM meal_catalog WHERE active AND source_type='reference'")).rows;
    foods.invalid_price_metadata = priced.filter(row => {
      const parsed = foodPriceDetailsSchema.safeParse(row.price_details);
      if (!parsed.success || Number(row.portion_grams) !== parsed.data.basisGrams) return true;
      const details = parsed.data;
      return details.status === "not_priced" ? row.sample_price_rupiah !== null
        : row.sample_price_rupiah !== calculateFoodPrice(details.reference, details.calculation);
    }).length;
    const exercises = (await client.query(`SELECT count(*)::int AS entries, count(*) FILTER (WHERE movement_tags IS NULL OR cardinality(movement_tags)=0)::int AS missing_tags FROM exercise_catalog WHERE active`)).rows[0];
    await client.query("ROLLBACK");
    console.info(JSON.stringify({ mode: "read-only", places, foods, exercises,
      limitations: ["Source presence does not verify current operator access/hours/prices", "Gym prices/hours/facilities are not modeled", "TKPI is nutrition reference, not market prices", "All numeric food prices are labeled estimates, not verified individual/live offers", "Intentional exclusions are not free foods"] }, null, 2));
    if (places.invalid || places.inconsistent_access || places.malformed_sources || foods.missing_provenance || foods.missing_price_metadata || foods.invalid_price_metadata || exercises.missing_tags) process.exitCode = 1;
  } finally { client.release(); await getPool().end(); }
}
void main().catch(() => { console.error("Catalog audit failed; connection details withheld"); process.exitCode = 1; });
