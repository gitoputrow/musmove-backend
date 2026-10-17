// Reproduce the data portion of migration 0014 from the checked-in source
// snapshot. Stdout only; never connects to a database or writes any files.
import { curateAdditionalNutrients, loadTkpiSnapshot } from "./tkpi-data";

async function main() {
const snapshot = await loadTkpiSnapshot();
const quote = (value: unknown): string => value === null ? "NULL"
  : typeof value === "number" ? String(value)
  : `'${String(value).replaceAll("'", "''")}'`;
const mainNutrients = ["caloriesKcal", "proteinGrams", "carbohydrateGrams", "fatGrams", "fiberGrams", "sodiumMg"];
const columns = ["id", "id_label", "en_label", "meal_type", "portion_label", "portion_grams", "food_group", "food_kind",
  "calories_kcal", "protein_grams", "carbohydrate_grams", "fat_grams", "fiber_grams", "sodium_mg",
  "sample_price_rupiah", "source_type", "source_note", "source_url", "source_code", "source_checked_at", "source_details"];
const note = "Rujukan TKPI 2017 Kementerian Kesehatan RI (terbit 2018), per 100 g bagian dapat dimakan. Dicocokkan ke tabel sumber, bukan uji laboratorium independen atas makanan pengguna. Penanda biru = imputasi/borrowed; kosong atau tanda '-' = null; 0 dapat berarti trace. Jenis/metode serat tidak dibedakan oleh TKPI. Angka sumber yang ditandai janggal ditahan di withheldNutrients untuk review, bukan diperbaiki dengan tebakan. Resep, varietas dan pengolahan dapat berbeda; bukan harga atau label merek tertentu.";
const usable = snapshot.foods.filter((food) => food.nutrients.caloriesKcal !== null && food.nutrients.proteinGrams !== null);
if (usable.length !== 1145) throw new Error("Unexpected usable TKPI count; inspect missing values, never fill with zero");
const nutrientFields = Object.keys(snapshot.foods[0].nutrients);
const rows = usable.map((food) => [food.code, food.name, food.enLabel, food.foodGroup, food.foodKind,
  food.pdfPage, food.printedPage, food.originalReference, food.ediblePercent,
  nutrientFields.map((key) => food.nutrients[key]), food.imputedOrBorrowedFields, curateAdditionalNutrients(food).withheldNutrients]);
const amount = (field: string) => `(food->9->>${nutrientFields.indexOf(field)})::numeric`;
const extra = nutrientFields.filter((field) => !mainNutrients.includes(field))
  .map((field) => `${quote(field)}, ${amount(field)}`).join(",\n      ");
const payload = "[\n" + rows.map((row) => JSON.stringify(row)).join(",\n") + "\n]";
console.log(`-- Generated from the official TKPI snapshot; do not hand-edit nutrient numbers.
-- Source SHA-256: ${snapshot.sourceSha256}
-- ${rows.length} source-coded foods; quantities per 100 g edible portion.
-- MP013 is retained in the source snapshot but excluded here: protein is blank.
INSERT INTO meal_catalog (${columns.join(", ")})
SELECT 'tkpi-' || lower(food->>0), food->>1, food->>2, NULL,
  '100 g bagian yang dapat dimakan', 100, food->>3, food->>4,
  ${mainNutrients.map(amount).join(", ")},
  NULL, 'reference', ${quote(note)}, ${quote(snapshot.sourceUrl)}, food->>0, ${quote(snapshot.checkedAt)}::date,
  jsonb_build_object('dataset', 'TKPI_2017', 'pdfPage', food->5, 'printedPage', food->6,
    'originalReference', food->7, 'ediblePercent', food->8, 'imputedOrBorrowedFields', food->10,
    'additionalNutrients', jsonb_build_object(
      ${extra}
    ) || (SELECT coalesce(jsonb_object_agg(key, 'null'::jsonb), '{}'::jsonb) FROM jsonb_object_keys(food->11) AS flagged(key)),
    'withheldNutrients', food->11)
FROM jsonb_array_elements(${quote(payload)}::jsonb) AS source(food);`);
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
