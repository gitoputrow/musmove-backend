import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";

test("back-machine migration adds requested variations, hides old exercises and preserves history", async () => {
  const db = new PGlite();
  try {
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
    for (const migration of migrations.slice(0, 26)) await db.exec(migration.sql.join("\n"));
    // Already present by name under a different ID: retain it without duplication.
    await db.exec(`INSERT INTO exercise_catalog(id,mode,id_label,en_label,default_sets,default_reps,requirements,movement_tags)
      VALUES('existing_plate_pull','gym','Existing label','Lat Pulldown Plate Loaded',2,8,'[["lat_pulldown_machine"]]'::jsonb,ARRAY['shoulder','elbow','wrist','back','overhead_reach'])`);
    const userId = randomUUID();
    await db.query("INSERT INTO users(id,issuer,subject) VALUES($1::uuid,$2,$1::text)", [userId, "synthetic"]);
    const snapshot = [{ id: "high_row_machine", idLabel: "Old row", enLabel: "Old row", requirements: [["high_row_machine"]], sets: 1, reps: 8, targetWeightKg: null }];
    const logs = [{ exerciseId: "high_row_machine", setNumber: 1, completed: true, reps: 8, weightKg: 20 }];
    await db.query(`INSERT INTO workout_sessions(user_id,id,plan_id,mode,status,started_at,finished_at,recorded_on,exercise_snapshot,set_log,legacy_metadata,version)
      VALUES($1,'old-session','manual','gym','completed','2026-10-20T00:00:00Z','2026-10-20T00:30:00Z','2026-10-20',$2::jsonb,$3::jsonb,$4::jsonb,7)`,
    [userId, JSON.stringify(snapshot), JSON.stringify(logs), JSON.stringify({ source: "manual" })]);
    const beforeHistory = (await db.query("SELECT exercise_snapshot,set_log,version,updated_at FROM workout_sessions")).rows;
    const beforePrograms = (await db.query("SELECT * FROM workout_program_exercises ORDER BY program_id,position")).rows;
    const oldCatalog = (await db.query("SELECT id,en_label,requirements,movement_tags,muscle_targets FROM exercise_catalog WHERE mode='gym' AND id IN ('high_row_machine','iso_lateral_row_machine') ORDER BY id")).rows;
    const existing = (await db.query("SELECT id,id_label,en_label,requirements,default_sets,default_reps FROM exercise_catalog WHERE id='existing_plate_pull'")).rows;
    await db.exec("BEGIN"); await db.exec(migrations[26].sql.join("\n")); await db.exec("COMMIT");
    assert.deepEqual((await db.query("SELECT exercise_snapshot,set_log,version,updated_at FROM workout_sessions")).rows, beforeHistory);
    assert.deepEqual((await db.query("SELECT * FROM workout_program_exercises ORDER BY program_id,position")).rows, beforePrograms);
    assert.deepEqual((await db.query("SELECT id,en_label,requirements,movement_tags,muscle_targets FROM exercise_catalog WHERE mode='gym' AND id IN ('high_row_machine','iso_lateral_row_machine') ORDER BY id")).rows, oldCatalog);
    assert.deepEqual((await db.query("SELECT id,id_label,en_label,requirements,default_sets,default_reps FROM exercise_catalog WHERE id='existing_plate_pull'")).rows, existing);
    const hidden = (await db.query<{ active: boolean }>("SELECT active FROM exercise_catalog WHERE mode='gym' AND id IN ('high_row_machine','iso_lateral_row_machine')")).rows;
    assert.equal(hidden.length, 2); assert.ok(hidden.every(e => !e.active));
    const added = (await db.query<{ id: string; requirements: string[][]; movement_tags: string[]; muscle_targets: { primary: string[] } }>(`SELECT id,requirements,movement_tags,muscle_targets FROM exercise_catalog
      WHERE id IN ('lat_pulldown_cable_machine','lat_pulldown_machine','iso_lateral_row_plate_loaded','high_iso_lateral_row_plate_loaded') ORDER BY id`)).rows;
    assert.equal(added.length, 4); assert.ok(added.every(e => e.movement_tags.length > 0 && e.muscle_targets.primary.includes("lats")));
    assert.equal(added.find(e => e.id === "lat_pulldown_cable_machine")?.requirements[0][0], "lat_pulldown_machine");
    assert.equal(added.find(e => e.id === "lat_pulldown_machine")?.requirements[0][0], "lat_pulldown_standard_machine");
    const equipment = (await db.query<{ id: string; modes: string[] }>("SELECT id,modes FROM equipment_catalog WHERE id IN ('lat_pulldown_standard_machine','lat_pulldown_plate_loaded_machine','iso_lateral_row_plate_loaded_machine','high_iso_lateral_row_plate_loaded_machine')")).rows;
    assert.equal(equipment.length, 4); assert.ok(equipment.every(e => e.modes.join(",") === "gym"));
    assert.equal((await db.query<{ n: number }>("SELECT count(*)::int AS n FROM exercise_catalog WHERE mode='gym' AND lower(en_label)='lat pulldown plate loaded'")).rows[0].n, 1);
    const after = (await db.query("SELECT id,mode,id_label,en_label,active,requirements,movement_tags,muscle_targets FROM exercise_catalog ORDER BY mode,id")).rows;
    await db.exec(migrations[26].sql.join("\n"));
    assert.deepEqual((await db.query("SELECT id,mode,id_label,en_label,active,requirements,movement_tags,muscle_targets FROM exercise_catalog ORDER BY mode,id")).rows, after);
  } finally { await db.close(); }
});
