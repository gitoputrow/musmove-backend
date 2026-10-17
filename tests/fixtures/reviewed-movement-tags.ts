import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { MovementTag } from "../../src/modules/catalog/movement-tags";

// The reviewed SQL is the single data source, not another duplicated seed.
const sql = readFileSync(fileURLToPath(new URL("../../drizzle/0011_complete_exercise_movement_tags.sql", import.meta.url)), "utf8");
export const reviewedMovementTags = [...sql.matchAll(/\('(gym|calisthenics)', '([^']+)', '\{([^}]+)\}'::text\[\]\)/g)]
  .map((match) => ({ mode: match[1] as "gym" | "calisthenics", id: match[2], tags: match[3].split(",") as MovementTag[] }));
