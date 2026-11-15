import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Database } from "../../src/db/client";
import * as schema from "../../src/db/schema";
import type { WorkoutExercisePrescription, WorkoutSetLog } from "../../src/db/schema/types";
import { workoutDetail } from "../../src/modules/online/workouts";
import { workoutComparisonSchema } from "../../src/modules/workouts/comparison-schema";

const exercise = (id: string, changes: Partial<WorkoutExercisePrescription> = {}): WorkoutExercisePrescription => ({
  id, idLabel: id, enLabel: id, requirements: [[]], sets: 3, reps: 7, targetWeightKg: null, ...changes,
});
const log = (exerciseId: string, setNumber: number, weightKg: number | null, reps: number | null = 7, changes: Partial<WorkoutSetLog> = {}): WorkoutSetLog => ({
  exerciseId, setNumber, weightKg, reps, completed: true, ...changes,
});

test("workout comparisons use owned chronological exercise history and actual mode-qualified sets", async t => {
  const env = { ...process.env };
  const globals = globalThis as unknown as { musmoveDatabase?: Database; musmovePool?: unknown };
  const previousDb = globals.musmoveDatabase, previousPool = globals.musmovePool;
  const local = new PGlite();
  Object.assign(process.env, { NODE_ENV: "test" }); delete process.env.VERCEL;
  globals.musmovePool = { query() { throw new Error("Live database forbidden in isolated test"); } };
  try {
    for (const migration of readMigrationFiles({ migrationsFolder: "drizzle" })) await local.exec(migration.sql.join("\n"));
    const db = drizzle(local, { schema }); globals.musmoveDatabase = db as unknown as Database;
    const owner = randomUUID(), foreign = randomUUID();
    await db.insert(schema.users).values([owner, foreign].map(id => ({ id, issuer: "synthetic", subject: id })));
    const insert = async (id: string, day: number, exercises: WorkoutExercisePrescription[], logs: WorkoutSetLog[], changes: Partial<typeof schema.workoutSessions.$inferInsert> = {}) => {
      const date = `2020-01-${String(day).padStart(2, "0")}`;
      await db.insert(schema.workoutSessions).values({ userId: owner, id, planId: "manual", mode: "gym", status: "completed",
        startedAt: new Date(`${date}T10:00:00Z`), finishedAt: new Date(`${date}T11:00:00Z`), recordedOn: date,
        exerciseSnapshot: exercises, setLog: logs, legacyMetadata: { source: "manual" }, ...changes });
    };
    await t.test("last session is per exercise; missing sets do not fall back to an older or different numbered set", async () => {
      await insert("old", 1, [exercise("press"), exercise("row")], [log("press", 1, 10), log("press", 2, 10), log("row", 1, 20)]);
      await insert("previous", 2, [exercise("press")], [log("press", 1, 25, 8), log("press", 2, null), log("press", 3, 0)]);
      await insert("current", 5, [exercise("press", { sets: 4 }), exercise("row"), exercise("new")],
        [log("press", 1, 30), log("press", 2, 20), log("press", 3, 0), log("press", 4, 50), log("row", 1, 15), log("new", 1, 2)]);
      await insert("foreign", 4, [exercise("press")], [log("press", 1, 499)], { userId: foreign });
      await insert("deleted", 4, [exercise("press")], [log("press", 1, 499)], { deletedAt: new Date() });
      await insert("aborted", 4, [exercise("press")], [log("press", 1, 499)], { status: "aborted" });
      await insert("active", 4, [exercise("press")], [log("press", 1, 499)], { status: "active", finishedAt: null });
      await insert("uncompleted", 4, [exercise("press")], [log("press", 1, 499, 7, { completed: false })]);
      await insert("unmatched", 4, [exercise("press")], [log("wrong-exercise", 1, 499)]);
      await insert("out-of-range", 4, [exercise("press", { sets: 1 })], [log("press", 2, 499)]);
      await insert("overlap", 4, [exercise("press")], [log("press", 1, 499)], { finishedAt: new Date("2020-01-05T10:01:00Z") });
      await insert("later", 6, [exercise("press")], [log("press", 1, 499)]);
      const before = (await local.query("SELECT * FROM workout_sessions WHERE id='current'")).rows;
      const detail = await workoutDetail(owner, "current");
      assert.ok(workoutComparisonSchema.safeParse(detail.comparison).success);
      const [press, row, fresh] = detail.comparison.exercises;
      assert.equal(press.previousWorkout?.id, "previous");
      assert.deepEqual(press.setCount, { current: 4, previous: 3, delta: 1 });
      assert.deepEqual(press.sets[0].delta, { weightKg: 5, reps: -1, durationSeconds: null });
      assert.equal(press.sets[0].previous?.weightKg, 25);
      assert.equal(press.sets[1].delta.weightKg, null);
      assert.equal(press.sets[2].delta.weightKg, 0);
      assert.equal(press.sets[3].previous, null); assert.equal(press.sets[3].delta.weightKg, null);
      assert.equal(row.previousWorkout?.id, "old"); assert.equal(row.sets[0].delta.weightKg, -5);
      assert.equal(row.sets[1].current, null);
      assert.deepEqual(row.setCount, { current: 1, previous: 1, delta: 0 });
      assert.equal(fresh.previousWorkout, null); assert.equal(fresh.sets[0].delta.weightKg, null);
      assert.deepEqual(fresh.setCount, { current: 1, previous: null, delta: null });
      assert.deepEqual((await local.query("SELECT * FROM workout_sessions WHERE id='current'")).rows, before);
      await assert.rejects(workoutDetail(foreign, "current"), e => (e as { status: number }).status === 404);
    });
    await t.test("mixed modes never collide and labels/program changes do not replace stable exercise identity", async () => {
      await insert("mixed-before", 7, [exercise("same", { mode: "gym" }), exercise("same", { mode: "calisthenics" })],
        [log("same", 1, 25, 7, { exerciseMode: "gym" }), log("same", 1, 5, 9, { exerciseMode: "calisthenics" })], { mode: "mixed" });
      await insert("mixed-now", 8, [exercise("same", { mode: "gym", enLabel: "Renamed" }), exercise("same", { mode: "calisthenics" })],
        [log("same", 1, 30, 7, { exerciseMode: "gym" }), log("same", 1, 0, 8, { exerciseMode: "calisthenics" })], { mode: "mixed", planId: "different-program" });
      const result = (await workoutDetail(owner, "mixed-now")).comparison;
      assert.deepEqual(result.exercises.map(e => e.sets[0].delta.weightKg), [5, -5]);
      assert.deepEqual(result.exercises.map(e => e.sets[0].delta.reps), [0, -1]);
      assert.deepEqual(result.exercises.map(e => e.setCount), [{ current: 1, previous: 1, delta: 0 }, { current: 1, previous: 1, delta: 0 }]);
    });
    await t.test("missing actuals, incomplete sets, time tracking and changed tracking types retain null semantics", async () => {
      const hold = exercise("hold", { trackingType: "duration", reps: null, targetDurationSeconds: 30 });
      await insert("measurement-before", 9, [hold, exercise("changed"), exercise("decimal")],
        [log("hold", 1, 0, null, { durationSeconds: 20 }), log("changed", 1, 5), log("decimal", 1, 0.1)]);
      await insert("measurement-now", 10, [hold, { ...hold, id: "changed" }, exercise("decimal")],
        [log("hold", 1, null, null, { durationSeconds: 30 }), log("hold", 2, 0, null, { completed: false, durationSeconds: 10 }),
          log("changed", 1, 10, null, { durationSeconds: 30 }), log("decimal", 1, 0.3)]);
      const result = (await workoutDetail(owner, "measurement-now")).comparison;
      assert.deepEqual(result.exercises[0].sets[0].delta, { weightKg: null, reps: null, durationSeconds: 10 });
      assert.equal(result.exercises[0].sets[1].delta.durationSeconds, null);
      assert.deepEqual(result.exercises[0].setCount, { current: 1, previous: 1, delta: 0 });
      assert.deepEqual(result.exercises[1].sets[0].delta, { weightKg: null, reps: null, durationSeconds: null });
      assert.equal(result.exercises[2].sets[0].delta.weightKg, 0.2);
    });
    await t.test("set count decreases independently of the current prescription and ignores incomplete, invalid and duplicate references", async () => {
      const four = exercise("set-count", { sets: 4 });
      await insert("count-before", 11, [four], [1, 2, 3, 4].map(n => log(four.id, n, 25)));
      await insert("count-now", 12, [exercise(four.id)], [1, 2, 3].map(n => log(four.id, n, 30)));
      const reduced = (await workoutDetail(owner, "count-now")).comparison.exercises[0];
      assert.deepEqual(reduced.setCount, { current: 3, previous: 4, delta: -1 });
      assert.equal(reduced.sets.length, 3);
      await insert("count-partial", 13, [four], [
        log(four.id, 1, null, null), log(four.id, 2, 30, 7, { completed: false }),
        log(four.id, 5, 30), log("wrong-exercise", 3, 30), log(four.id, 3, 30, 7, { exerciseMode: "calisthenics" }),
        log(four.id, 4, 30), log(four.id, 4, 30),
      ]);
      const partial = (await workoutDetail(owner, "count-partial")).comparison.exercises[0];
      assert.deepEqual(partial.setCount, { current: 1, previous: 3, delta: -2 });
      assert.equal(partial.sets[0].current?.weightKg, null, "A completed set counts even with unknown load and reps");
      assert.ok(workoutComparisonSchema.safeParse((await workoutDetail(owner, "count-partial")).comparison).success);
      await insert("count-zero", 14, [four], []);
      assert.deepEqual((await workoutDetail(owner, "count-zero")).comparison.exercises[0].setCount, { current: 0, previous: 1, delta: -1 });
    });
  } finally {
    globals.musmoveDatabase = previousDb; globals.musmovePool = previousPool;
    process.env = env; await local.close();
  }
});
