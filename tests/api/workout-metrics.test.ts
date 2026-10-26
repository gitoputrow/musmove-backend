import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { buildResultMetrics, muscleCoverage } from "../../src/modules/workouts/result-metrics";
import { muscleTargetsSchema } from "../../src/modules/workouts/measurement";
import { entityPayloadSchemas, parseEntityPayload } from "../../src/modules/sync/dto";
import type { WorkoutExercisePrescription, WorkoutSetLog } from "../../src/db/schema/types";

const clock = new Date("2026-10-26T01:00:00Z");
const base = { source: "manual", startedAt: "2026-10-26T00:00:00Z", finishedAt: "2026-10-26T00:30:00Z" };
const exercise: WorkoutExercisePrescription = { id: "hold", mode: "gym", idLabel: "Hold", enLabel: "Hold", requirements: [[]], sets: 1,
  reps: null, trackingType: "duration", targetDurationSeconds: 30, targetWeightKg: null,
  muscleTargets: { version: "1", primary: ["abs"], secondary: ["obliques"] } };
const log: WorkoutSetLog = { exerciseId: "hold", exerciseMode: "gym", setNumber: 1, completed: true, reps: null, weightKg: null, durationSeconds: 20 };

test("session and MET provenance are explicit, nullable, versioned and separate from summed hold time", () => {
  const metrics = (input: Parameters<typeof buildResultMetrics>[0], profile = { ageYears: 25, weightKg: 70 }) => buildResultMetrics(input, profile, "gym", [exercise], [log], clock);
  const unknown = metrics(base); assert.equal(unknown.duration.seconds, null); assert.equal(unknown.energy.kcal, null); assert.equal(unknown.energy.reason, "DURATION_UNKNOWN");
  const timer = metrics({ ...base, sessionTiming: { source: "timer" }, energyActivityCode: "02054" });
  assert.equal(timer.duration.seconds, 1800); assert.equal(timer.energy.kcal, 128.6); assert.equal(timer.energy.bodyweightSource, "profile_at_submission");
  assert.equal(timer.energy.method, "standard_met_gross_v1"); assert.equal(timer.version, "1");
  const manual = metrics({ ...base, sessionTiming: { source: "user_reported", durationSeconds: 600 }, energyActivityCode: "02056", workoutBodyweightKg: 60 });
  assert.equal(manual.duration.seconds, 600); assert.equal(manual.energy.kcal, 31.5); assert.equal(manual.energy.bodyweightSource, "workout_user_reported");
  const timed = { ...base, sessionTiming: { source: "timer" as const } };
  assert.equal(metrics(timed).energy.reason, "ACTIVITY_REQUIRED");
  for (const ageYears of [18, 60]) assert.equal(metrics({ ...timed, energyActivityCode: "02054" }, { ageYears, weightKg: 70 }).energy.reason, "AGE_OUTSIDE_REFERENCE");
  assert.equal(metrics({ ...timed, energyActivityCode: "02054" }, { ageYears: 25, weightKg: 501 }).energy.reason, "BODYWEIGHT_OUT_OF_SCOPE");
  const old = { ...timed, startedAt: "2025-01-01T00:00:00Z", finishedAt: "2025-01-01T00:30:00Z", energyActivityCode: "02054" as const };
  assert.equal(metrics(old).energy.reason, "WORKOUT_BODYWEIGHT_REQUIRED"); assert.equal(metrics({ ...old, workoutBodyweightKg: 70 }).energy.kcal, 128.6);
  assert.equal(metrics({ ...timed, energyActivityCode: "02054", finishedAt: "2026-10-26T05:00:00Z" }).energy.reason, "DURATION_OUT_OF_SCOPE");
  assert.throws(() => metrics({ ...base, source: "custom", sessionTiming: { source: "user_reported", durationSeconds: 600 } }));
  assert.throws(() => metrics({ ...base, sessionTiming: { source: "timer" }, finishedAt: base.startedAt }));
  assert.throws(() => metrics({ ...base, sessionTiming: { source: "user_reported", durationSeconds: 10 } }));
  assert.equal(buildResultMetrics({ ...timed, energyActivityCode: "02054" }, { ageYears: 25, weightKg: 70 }, "gym", [exercise], [], clock).energy.reason, "NO_COMPLETED_SETS");
});

test("muscle coverage uses mode-qualified completed references only, and unknown/partial never means full body", () => {
  const other: WorkoutExercisePrescription = { ...exercise, mode: "calisthenics", muscleTargets: null };
  assert.equal(muscleCoverage("mixed", [exercise, other], []).coverage, "unknown");
  const one = muscleCoverage("mixed", [exercise, other], [log]); assert.equal(one.coverage, "complete"); assert.deepEqual(one.primary, ["abs"]);
  const partial = muscleCoverage("mixed", [exercise, other], [log, { ...log, exerciseMode: "calisthenics" }]);
  assert.equal(partial.coverage, "partial"); assert.deepEqual(partial.unknownExercises, [{ id: "hold", mode: "calisthenics" }]);
  assert.equal(muscleCoverage("mixed", [exercise], [{ ...log, exerciseMode: "calisthenics" }]).completedExerciseCount, 0);
  assert.equal(muscleCoverage("gym", [exercise], [{ ...log, completed: false }]).completedExerciseCount, 0);
});

test("0024 preserves existing results/receipts/versions while adding reviewed anatomy and explicit duration entries", async () => {
  const db = new PGlite();
  try {
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
    for (const m of migrations.slice(0, 24)) await db.exec(m.sql.join("\n"));
    const userId = randomUUID(); await db.query("INSERT INTO users(id,issuer,subject) VALUES($1::uuid,$2,$1::text)", [userId, "synthetic"]);
    const old = { ...base, mode: "gym", planId: "manual", status: "completed", recordedOn: "2026-10-26", legacyMetadata: { source: "manual" },
      exerciseSnapshot: [{ id: "bench_press", idLabel: "Old label", enLabel: "Old label", requirements: [[]], sets: 1, reps: 8, targetWeightKg: null }],
      setLog: [{ exerciseId: "bench_press", setNumber: 1, completed: true, reps: 8, weightKg: null }] };
    await db.query("INSERT INTO workout_sessions(user_id,id,plan_id,mode,status,started_at,finished_at,recorded_on,exercise_snapshot,set_log,legacy_metadata,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,7)",
      [userId, "old", old.planId, old.mode, old.status, old.startedAt, old.finishedAt, old.recordedOn, JSON.stringify(old.exerciseSnapshot), JSON.stringify(old.setLog), JSON.stringify(old.legacyMetadata)]);
    await db.query("INSERT INTO operation_receipts(user_id,operation_id,request_hash,result) VALUES($1,$2,$3,$4::jsonb)", [userId, randomUUID(), "0".repeat(64), JSON.stringify({ response: { item: old } })]);
    const before = (await db.query("SELECT id,mode,status,exercise_snapshot,set_log,version,updated_at FROM workout_sessions")).rows;
    const receipts = (await db.query("SELECT * FROM operation_receipts")).rows;
    await db.exec("BEGIN;"); await db.exec(migrations[24].sql.join("\n")); await db.exec("COMMIT;");
    assert.deepEqual((await db.query("SELECT id,mode,status,exercise_snapshot,set_log,version,updated_at FROM workout_sessions")).rows, before);
    assert.deepEqual((await db.query("SELECT * FROM operation_receipts")).rows, receipts);
    assert.equal((await db.query<{ result_metrics: unknown }>("SELECT result_metrics FROM workout_sessions")).rows[0].result_metrics, null);
    const catalog = (await db.query<{ tracking_type: string; muscle_targets: unknown; default_reps: number | null; default_duration_seconds: number | null }>("SELECT tracking_type,muscle_targets,default_reps,default_duration_seconds FROM exercise_catalog")).rows;
    assert.equal(catalog.length, 119); assert.equal(catalog.filter(e => e.tracking_type === "duration").length, 2);
    assert.ok(catalog.every(e => muscleTargetsSchema.safeParse(e.muscle_targets).success));
    assert.ok(catalog.filter(e => e.tracking_type === "duration").every(e => e.default_reps === null && e.default_duration_seconds === 30));
    const { source: _source, ...legacy } = old; void _source;
    assert.ok(entityPayloadSchemas.workout_session.safeParse(legacy).success);
    assert.throws(() => parseEntityPayload("workout_session", { ...legacy, resultMetrics: { energy: { kcal: 100 } } }));
  } finally { await db.close(); }
});
