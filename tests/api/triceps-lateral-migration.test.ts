import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { matchesEquipmentCategory } from "../../src/modules/catalog/exercise-query";

test("migration preserves existing exercises and adds distinct triceps, lateral raise and T-bar variants", async () => {
  const db = new PGlite();
  try {
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
    for (const migration of migrations.slice(0, 27)) await db.exec(migration.sql.join("\n"));
    const straight = (await db.query("SELECT * FROM exercise_catalog WHERE mode='gym' AND id='straight_arm_cable_pulldown'")).rows;
    const before = (await db.query("SELECT id,requirements,muscle_targets,movement_tags FROM exercise_catalog WHERE mode='gym' AND id='raise'")).rows;
    const programs = (await db.query("SELECT * FROM workout_program_exercises ORDER BY program_id,position")).rows;
    await db.exec(migrations[27].sql.join("\n"));
    assert.deepEqual((await db.query("SELECT * FROM exercise_catalog WHERE mode='gym' AND id='straight_arm_cable_pulldown'")).rows, straight);
    assert.deepEqual((await db.query("SELECT id,requirements,muscle_targets,movement_tags FROM exercise_catalog WHERE mode='gym' AND id='raise'")).rows, before);
    assert.deepEqual((await db.query("SELECT * FROM workout_program_exercises ORDER BY program_id,position")).rows, programs);
    assert.equal((await db.query<{ en_label: string }>("SELECT en_label FROM exercise_catalog WHERE mode='gym' AND id='raise'")).rows[0].en_label, "Dumbbell Lateral Raise");
    const ids = ["single_arm_cable_triceps_pushdown", "single_arm_overhead_cable_triceps_extension", "overhead_cable_triceps_extension", "cable_triceps_pushdown", "single_arm_dumbbell_lateral_raise", "plate_loaded_lateral_raise", "seated_plate_loaded_lateral_raise", "machine_lateral_raise", "seated_machine_lateral_raise", "cable_lateral_raise", "single_arm_cable_lateral_raise", "plate_loaded_t_bar_row", "plate_loaded_chest_supported_t_bar_row"];
    const rows = (await db.query<{ id: string; requirements: string[][]; movement_tags: string[]; muscle_targets: { primary: string[] } }>("SELECT id,requirements,movement_tags,muscle_targets FROM exercise_catalog WHERE mode='gym' AND id=ANY($1)", [ids])).rows;
    assert.equal(rows.length, 13);
    for (const row of rows) {
      const category = row.id.includes("plate_loaded") ? "plate" : row.id.includes("dumbbell") ? "dumbbell" : row.id.includes("cable") ? "cable" : "machine";
      assert.ok(matchesEquipmentCategory(row.requirements, category));
      assert.ok(row.movement_tags.length && row.muscle_targets.primary.length);
    }
    const after = (await db.query("SELECT * FROM exercise_catalog ORDER BY mode,id")).rows;
    await db.exec(migrations[27].sql.join("\n"));
    assert.deepEqual((await db.query("SELECT * FROM exercise_catalog ORDER BY mode,id")).rows, after);
  } finally { await db.close(); }
});
