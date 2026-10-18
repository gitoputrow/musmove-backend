// Deterministic stdout only. No network, environment files, or database access.
import { buildFoodPrices } from "./food-price-data";
import { foodPriceDetailsCheckSql } from "../src/modules/meals/prices";

export async function foodPricesMigration() {
  const rows = await buildFoodPrices();
  if (rows.length !== 1145 || new Set(rows.map(row => row.id)).size !== 1145) throw new Error("Incomplete pricing coverage");
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  // Deduplicate repeated product provenance in the SQL payload. Every final DB
  // row still owns a full immutable price-details snapshot, not a runtime join.
  const refs = new Map<string, unknown>();
  const profiles = new Map<string, string>();
  const payload = rows.map(({ id, samplePriceRupiah, priceDetails }) => {
    if (priceDetails.reference) refs.set(priceDetails.reference.id, priceDetails.reference);
    const profile = JSON.stringify({ ...priceDetails, reference: priceDetails.reference?.id ?? null });
    if (!profiles.has(profile)) profiles.set(profile, `p${profiles.size + 1}`);
    return [id, samplePriceRupiah, profiles.get(profile)];
  });
  const profileJson = JSON.stringify([...profiles].map(([value, id]) => [id, JSON.parse(value)]));
  return `-- Generated from reviewed internet price references; every non-null price is an ESTIMATE.
-- Source date/market/units and proxy/cost-model assumptions remain in price_details.
-- Do not rewrite historical meal_entries or nutrient values. The nutrition note
-- also warns older deployed API/mobile versions that numeric prices are estimates.
ALTER TABLE meal_catalog ADD COLUMN price_details jsonb;
--> statement-breakpoint
WITH refs AS (SELECT value AS ref FROM jsonb_array_elements(${quote(JSON.stringify([...refs.values()]))}::jsonb)),
profiles AS (SELECT value AS profile FROM jsonb_array_elements(${quote(profileJson)}::jsonb)),
prices AS (SELECT value AS item FROM jsonb_array_elements(${quote("[\n" + payload.map(row => JSON.stringify(row)).join(",\n") + "\n]")}::jsonb))
UPDATE meal_catalog m SET sample_price_rupiah = (p.item->>1)::integer,
  price_details = (d.profile->1) || jsonb_build_object('reference', r.ref),
  source_note = m.source_note || ' Harga makanan: semua angka harga merupakan ESTIMASI per 100 g bagian dapat dimakan, bukan harga jual pasti/live atau data harga TKPI. Dapat memakai proksi pangan sejenis atau model biaya bahan. Sumber harga, lokasi, satuan, tanggal pemeriksaan dan asumsi tersimpan terpisah di priceDetails. Item non-ritel/sensitif tidak diberi harga. Jangan anggap harga null sebagai gratis.'
FROM prices p JOIN profiles d ON d.profile->>0 = p.item->>2
LEFT JOIN refs r ON r.ref->>'id' = d.profile->1->>'reference'
WHERE m.id = p.item->>0 AND m.source_type = 'reference';
--> statement-breakpoint
ALTER TABLE meal_catalog ADD CONSTRAINT meal_catalog_price_details CHECK (${foodPriceDetailsCheckSql});
--> statement-breakpoint
ALTER TABLE meal_catalog ADD CONSTRAINT meal_catalog_reference_price_metadata CHECK (source_type <> 'reference' OR price_details IS NOT NULL);
--> statement-breakpoint
DO $$ BEGIN
  IF (SELECT count(*) FROM meal_catalog WHERE source_type = 'reference' AND price_details IS NOT NULL) <> 1145 THEN
    RAISE EXCEPTION 'Price metadata coverage mismatch; rollback required';
  END IF;
END $$;
`;
}

if (process.argv[1]?.endsWith("build-food-prices-migration.ts")) {
  void foodPricesMigration().then(sql => process.stdout.write(sql)).catch(() => { console.error("Price migration generation failed; check reviewed references"); process.exitCode = 1; });
}
