import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";

test("plate-loaded chest exercises use valid equipment and preserve an existing equivalent", async () => {
  const db = new PGlite();
  try {
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
    for (const migration of migrations.slice(0, 25)) await db.exec(migration.sql.join("\n"));
    // An existing matching name with a different ID must be kept, not duplicated.
    await db.exec(`INSERT INTO exercise_catalog(id,mode,id_label,en_label,default_sets,default_reps,requirements,movement_tags)
      VALUES('previous_seated_plate','gym','Existing label','Seated Chest Press Plate Loaded',2,8,'[["chest_press_machine"]]'::jsonb,ARRAY['shoulder','elbow','wrist'])`);
    const before = (await db.query("SELECT id,mode,id_label,en_label,requirements,default_sets,default_reps FROM exercise_catalog ORDER BY mode,id")).rows;
    const migration = migrations[25];
    await db.exec("BEGIN"); await db.exec(migration.sql.join("\n")); await db.exec("COMMIT");
    const preserved = (await db.query("SELECT id,mode,id_label,en_label,requirements,default_sets,default_reps FROM exercise_catalog WHERE id='previous_seated_plate'")).rows[0];
    assert.deepEqual(preserved, before.find((r: unknown) => (r as { id: string }).id === "previous_seated_plate"));
    const exercises = (await db.query<{ id: string; en_label: string; requirements: string[][]; movement_tags: string[]; muscle_targets: { primary: string[]; secondary: string[] } | null }>(
      "SELECT id,en_label,requirements,movement_tags,muscle_targets FROM exercise_catalog WHERE mode='gym' AND lower(en_label) LIKE '%chest press%plate loaded%' ORDER BY id")).rows;
    assert.equal(exercises.length, 6);
    assert.equal(new Set(exercises.map(e => e.en_label.toLowerCase())).size, 6);
    const added = exercises.filter(e => e.id !== "previous_seated_plate");
    assert.equal(added.length, 5);
    assert.ok(added.every(e => e.requirements.length === 1 && e.requirements[0][0].includes("plate_loaded")));
    assert.ok(added.every(e => e.movement_tags.join(",") === "shoulder,elbow,wrist" && e.muscle_targets?.primary.includes("chest")));
    const equipment = (await db.query<{ id: string; modes: string[] }>("SELECT id,modes FROM equipment_catalog WHERE id LIKE '%plate_loaded%' ORDER BY id")).rows;
    assert.equal(equipment.length, 3); assert.ok(equipment.every(e => e.modes.join(",") === "gym"));
    assert.ok(added.every(e => equipment.some(item => item.id === e.requirements[0][0])));
    const after = (await db.query("SELECT id,mode,id_label,en_label,requirements,default_sets,default_reps FROM exercise_catalog ORDER BY mode,id")).rows;
    for (const old of before) assert.ok(after.some(row => JSON.stringify(row) === JSON.stringify(old)));
    await db.exec(migration.sql.join("\n"));
    assert.deepEqual((await db.query("SELECT id,mode,id_label,en_label,requirements,default_sets,default_reps FROM exercise_catalog ORDER BY mode,id")).rows, after);
  } finally { await db.close(); }
});
