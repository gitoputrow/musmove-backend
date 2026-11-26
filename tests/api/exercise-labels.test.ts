import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Database } from "../../src/db/client";
import * as schema from "../../src/db/schema";
import labels from "../../src/db/data/exercise-labels-2026-11-25.json";
import journal from "../../drizzle/meta/_journal.json";
import { getExerciseCatalog } from "../../src/modules/catalog/exercises";
import { matchesEquipmentCategory } from "../../src/modules/catalog/exercise-query";
import { workoutDetail } from "../../src/modules/online/workouts";

test("reviewed bilingual labels preserve catalog identities, all training metadata, saved history and comparison", async () => {
  const env = { ...process.env };
  const globals = globalThis as unknown as { musmoveDatabase?: Database; musmovePool?: unknown };
  const previousDb = globals.musmoveDatabase, previousPool = globals.musmovePool;
  const local = new PGlite();
  Object.assign(process.env, { NODE_ENV: "test" }); delete process.env.VERCEL;
  globals.musmovePool = { query() { throw new Error("Live database forbidden in isolated test"); } };
  try {
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
    const timestamp = journal.entries.find(e => e.tag === "0038_standardize_exercise_labels")!.when;
    const index = migrations.findIndex(m => m.folderMillis === timestamp); assert.ok(index > 0);
    // Apply every other migration first so the current Drizzle schema matches;
    // 0038 is catalog-only and is exercised last against saved user data.
    for (const migration of migrations.filter((_, i) => i !== index)) await local.exec(migration.sql.join("\n"));
    const migration = migrations[index];
    const db = drizzle(local, { schema }); globals.musmoveDatabase = db as unknown as Database;
    const before = await db.select().from(schema.exerciseCatalog);
    const bench = before.find(e => e.mode === "gym" && e.id === "bench_press")!;
    const prescription = { id: bench.id, idLabel: bench.idLabel, enLabel: bench.enLabel, requirements: bench.requirements,
      sets: 3, reps: 8, targetWeightKg: null };
    const userId = randomUUID();
    await db.insert(schema.users).values({ id: userId, issuer: "synthetic", subject: userId });
    await db.insert(schema.userExercises).values({ userId, id: "custom-press", mode: "gym", name: bench.enLabel, defaultSets: 3, defaultReps: 8 });
    await db.insert(schema.customPrograms).values({ userId, id: "saved-plan", mode: "gym", name: "Saved plan", exercisePrescriptions: [prescription] });
    for (const [id, day, weightKg] of [["history-before", "2020-01-01", 25], ["history-after", "2020-01-02", 30]] as const) {
      await db.insert(schema.workoutSessions).values({ userId, id, planId: "saved-plan", mode: "gym", status: "completed",
        startedAt: new Date(`${day}T10:00:00Z`), finishedAt: new Date(`${day}T11:00:00Z`), recordedOn: day,
        exerciseSnapshot: [prescription], setLog: [{ exerciseId: bench.id, setNumber: 1, completed: true, reps: 8, weightKg }] });
    }
    await db.insert(schema.operationReceipts).values({ userId, operationId: randomUUID(), requestHash: "0".repeat(64), result: { kind: "synthetic", response: { exerciseSnapshot: [prescription] } } });
    const saved = async () => ({
      exercises: (await local.query("SELECT * FROM user_exercises")).rows,
      programs: (await local.query("SELECT * FROM custom_programs")).rows,
      history: (await local.query("SELECT * FROM workout_sessions ORDER BY id")).rows,
      receipts: (await local.query("SELECT * FROM operation_receipts")).rows,
    });
    const savedBefore = await saved();
    const comparisonBefore = (await workoutDetail(userId, "history-after")).comparison;
    const version = (await getExerciseCatalog()).catalogVersion;
    await local.exec(migration.sql.join("\n"));
    const after = await db.select().from(schema.exerciseCatalog);
    assert.equal(after.length, 143); assert.equal(after.filter(e => e.active).length, 141);
    for (const current of after) {
      const original = before.find(e => e.id === current.id && e.mode === current.mode)!;
      const reviewed = labels.exercises.find(e => e.id === current.id && e.mode === current.mode)!;
      assert.ok(reviewed); assert.equal(current.idLabel, reviewed.idLabel); assert.equal(current.enLabel, reviewed.enLabel);
      assert.match(current.idLabel, /^.+ \([^()]+\)$/); assert.match(current.enLabel, /^.+ \([^()]+\)$/);
      assert.ok(current.idLabel.length <= 80 && current.enLabel.length <= 80);
      for (const key of Object.keys(original) as (keyof typeof original)[]) {
        if (!["idLabel", "enLabel", "updatedAt"].includes(key)) assert.deepEqual(current[key], original[key], `${current.mode}/${current.id}.${key}`);
      }
      for (const category of ["barbell", "dumbbell", "cable", "machine", "plate", "no_equipment"] as const) {
        if (reviewed.equipmentType === category) assert.ok(matchesEquipmentCategory(current.requirements, category), current.id);
      }
    }
    const expected = {
      bench_press: "Bench Press (Barbell)", flat_dumbbell_bench_press: "Flat Bench Press (Dumbbell)",
      seated_chest_press_machine: "Seated Chest Press (Machine)", standing_cable_chest_press: "Standing Chest Press (Cable)",
      chest_press_plate_loaded: "Chest Press (Plate-Loaded)", smith_machine_bench_press: "Bench Press (Smith Machine)",
      pullup: "Pull-Up (Pull-Up Bar)", band_assisted_pullup: "Assisted Pull-Up (Pull-Up Bar + Resistance Band)",
      pushup: "Push-Up (No Equipment)", single_arm_dumbbell_bench_press: "Single-Arm Bench Press (Dumbbell)",
    };
    for (const [id, name] of Object.entries(expected)) assert.equal(after.find(e => e.id === id)!.enLabel, name);
    assert.deepEqual(await saved(), savedBefore);
    const detail = await workoutDetail(userId, "history-after");
    assert.deepEqual(detail.comparison, comparisonBefore);
    assert.equal(detail.comparison.exercises[0].previousWorkout?.id, "history-before");
    assert.equal(detail.comparison.exercises[0].sets[0].delta.weightKg, 5);
    const catalog = await getExerciseCatalog({ mode: "gym", equipment: "barbell" });
    assert.equal(catalog.exercises.length, 19);
    assert.equal(BigInt(catalog.catalogVersion), BigInt(version) + BigInt(1));
    assert.ok(catalog.exercises.some(e => e.id === "bench_press" && e.idLabel === "Bench Press (Barbel)"));
    await local.exec(migration.sql.join("\n"));
    assert.deepEqual(await db.select().from(schema.exerciseCatalog), after);
    assert.equal((await getExerciseCatalog()).catalogVersion, catalog.catalogVersion);

    await local.exec("BEGIN; UPDATE exercise_catalog SET en_label='Manually edited label' WHERE mode='gym' AND id='bench_press'");
    await assert.rejects(local.exec(migration.sql.join("\n")), /mapping does not match/);
    await local.exec("ROLLBACK");
    assert.deepEqual(await db.select().from(schema.exerciseCatalog), after);
  } finally {
    globals.musmoveDatabase = previousDb; globals.musmovePool = previousPool;
    process.env = env; await local.close();
  }
});
