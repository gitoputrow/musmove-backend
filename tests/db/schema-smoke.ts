import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { validMovementTags } from "../../src/modules/catalog/movement-tags";
import { reviewedMovementTags } from "../fixtures/reviewed-movement-tags";

async function main() {
  const client = new PGlite();

  try {
    await migrate(drizzle(client), {
      migrationsFolder: "./drizzle",
      migrationsSchema: "drizzle",
      migrationsTable: "migrations",
    });

    const smokeSql = await readFile("./tests/db/schema-smoke.sql", "utf8");
    await client.exec(smokeSql);

    const result = await client.query<{ table_count: number }>(`
      select count(*)::integer as table_count
        from information_schema.tables
       where table_schema = 'public'
         and table_type = 'BASE TABLE'
    `);

    if (result.rows[0]?.table_count !== 30) {
      throw new Error("Schema smoke test did not find all 30 application tables");
    }

    const equipment = await client.query<{ count: number }>("select count(*)::integer as count from equipment_catalog");
    if (equipment.rows[0].count !== 39) throw new Error("Equipment catalog seed is incomplete");
    const unmapped = await client.query<{ count: number }>(`
      select count(*)::integer as count from exercise_catalog e,
      jsonb_array_elements(e.requirements) g(value), jsonb_array_elements_text(g.value) key(id)
      where not exists (select 1 from equipment_catalog where id = key.id)
    `);
    if (unmapped.rows[0].count !== 0) throw new Error("Exercise requirement has no equipment catalog entry");
    const equipmentBefore = await client.query<{ version: string }>("select version::text from catalog_state where name = 'equipment'");
    await client.exec("BEGIN; UPDATE equipment_catalog SET name = 'Updated dumbbell' WHERE id = 'dumbbell';");
    const equipmentState = await client.query<{ version: string }>("select version::text from catalog_state where name = 'equipment'");
    if (BigInt(equipmentState.rows[0].version) !== BigInt(equipmentBefore.rows[0].version) + BigInt(1)) throw new Error("Equipment catalog version trigger failed");
    await client.exec("ROLLBACK;");

    const catalog = await client.query<{ count: number }>(
      "select count(*)::integer as count from exercise_catalog",
    );
    if (catalog.rows[0]?.count !== 143) throw new Error("Catalog seed is incomplete");
    const taggedExercises = await client.query<{ mode: string; id: string; movement_tags: string[] }>(
      "select mode, id, movement_tags from exercise_catalog",
    );
    for (const exercise of taggedExercises.rows) {
      const reviewed = reviewedMovementTags.find((r) => r.mode === exercise.mode && r.id === exercise.id);
      if (!validMovementTags(exercise.movement_tags) || !reviewed
        || JSON.stringify(exercise.movement_tags) !== JSON.stringify(reviewed.tags)) {
        throw new Error(`Invalid/incomplete movement tags: ${exercise.mode}/${exercise.id}`);
      }
    }
    const beforeVersion = await client.query<{ version: string }>(
      "select version::text from catalog_state where name = 'exercises'",
    );
    await client.exec("BEGIN; UPDATE exercise_catalog SET active = false WHERE mode = 'gym' AND id = 'press';");
    const version = await client.query<{ version: string }>(
      "select version::text from catalog_state where name = 'exercises'",
    );
    if (BigInt(version.rows[0].version) !== BigInt(beforeVersion.rows[0].version) + BigInt(1)) throw new Error("Catalog version trigger failed");
    await client.exec("ROLLBACK;");

    const places = await client.query<{ total: number; brands: number; locals: number; parks: number }>(`
      select count(*)::integer as total,
        count(*) filter (where gym_category = 'brand')::integer as brands,
        count(*) filter (where gym_category = 'conventional')::integer as locals,
        count(*) filter (where mode = 'calisthenics')::integer as parks
      from place_catalog
    `);
    const counts = places.rows[0];
    if (counts.total !== 18 || counts.brands !== 13 || counts.locals !== 2 || counts.parks !== 3) {
      throw new Error("Jakarta place seed is incomplete");
    }
    const removedColumns = await client.query<{ count: number }>(`
      select count(*)::integer as count from information_schema.columns
      where table_schema = 'public' and table_name = 'place_catalog'
      and column_name in ('access_evidence', 'access_note', 'location_note', 'equipment', 'coordinate_scope')
    `);
    if (removedColumns.rows[0].count !== 0) throw new Error("Removed place columns still exist");
    const beforePlaceState = await client.query<{ version: string }>("select version::text from catalog_state where name = 'places'");
    const beforePlaceRow = await client.query<{ version: string }>("select version::text from place_catalog where id = 'jakarta-ftl-tebet'");
    await client.exec("BEGIN; UPDATE place_catalog SET active = false WHERE id = 'jakarta-ftl-tebet';");
    const placeVersion = await client.query<{ version: string }>("select version::text from place_catalog where id = 'jakarta-ftl-tebet'");
    const placeState = await client.query<{ version: string }>("select version::text from catalog_state where name = 'places'");
    if (BigInt(placeVersion.rows[0].version) !== BigInt(beforePlaceRow.rows[0].version) + BigInt(1)
      || BigInt(placeState.rows[0].version) !== BigInt(beforePlaceState.rows[0].version) + BigInt(1)) throw new Error("Place catalog version triggers failed");
    await client.exec("DELETE FROM place_catalog WHERE id = 'jakarta-ftl-tebet';");
    const afterDelete = await client.query<{ version: string }>("select version::text from catalog_state where name = 'places'");
    if (BigInt(afterDelete.rows[0].version) !== BigInt(beforePlaceState.rows[0].version) + BigInt(2)) throw new Error("Place delete version trigger failed");
    await client.exec("ROLLBACK;");

    const meals = await client.query<{ count: number }>("select count(*)::integer as count from meal_catalog where source_type = 'demo'");
    if (meals.rows[0].count !== 3) throw new Error("Meal demo seed is incomplete");
    const mealStateBefore = await client.query<{ version: string }>("select version::text from catalog_state where name = 'meals'");
    await client.exec("BEGIN; UPDATE meal_catalog SET calories_kcal = 390 WHERE id = 'demo-oats-banana-milk';");
    const mealVersion = await client.query<{ version: string }>("select version::text from meal_catalog where id = 'demo-oats-banana-milk'");
    const mealState = await client.query<{ version: string }>("select version::text from catalog_state where name = 'meals'");
    if (mealVersion.rows[0].version !== "2" || BigInt(mealState.rows[0].version) !== BigInt(mealStateBefore.rows[0].version) + BigInt(1)) throw new Error("Meal catalog version triggers failed");
    await client.exec("ROLLBACK;");

    console.info("Database schema smoke test passed");
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown schema test error";
  console.error(`Database schema smoke test failed: ${message}`);
  process.exitCode = 1;
});
