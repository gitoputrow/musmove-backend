import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { MovementTag } from "../../src/modules/catalog/movement-tags";

// The reviewed SQL is the single data source, not another duplicated seed.
const sql = readFileSync(fileURLToPath(new URL("../../drizzle/0011_complete_exercise_movement_tags.sql", import.meta.url)), "utf8");
export const reviewedMovementTags = [...sql.matchAll(/\('(gym|calisthenics)', '([^']+)', '\{([^}]+)\}'::text\[\]\)/g)]
  .map((match) => ({ mode: match[1] as "gym" | "calisthenics", id: match[2], tags: match[3].split(",") as MovementTag[] }));
// New explicitly timed entries introduced in0024; do not alter0011 history.
for (const mode of ["gym", "calisthenics"] as const) reviewedMovementTags.push({ mode, id: "plank", tags: ["shoulder", "elbow", "back", "hip", "floor_transfer"] });
// Read the new explicit IDs and their shared tags from migration0025.
const plateSql = readFileSync(fileURLToPath(new URL("../../drizzle/0025_plate_loaded_chest_press.sql", import.meta.url)), "utf8");
const plateTags = plateSql.match(/ARRAY\['shoulder','elbow','wrist'\]/)?.[0];
if (!plateTags) throw new Error("Missing reviewed plate-loaded movement tags");
for (const match of plateSql.matchAll(/\('([a-z_]+_plate_loaded)',\s*'[^']+',\s*'[^']+'\)/g)) {
  reviewedMovementTags.push({ mode: "gym", id: match[1], tags: ["shoulder", "elbow", "wrist"] });
}
