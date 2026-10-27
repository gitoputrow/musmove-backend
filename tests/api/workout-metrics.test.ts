import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { buildResultMetrics, muscleCoverage } from "../../src/modules/workouts/result-metrics";
import { currentResultMetricsSchema, muscleTargetsSchema, resultMetricsSchema } from "../../src/modules/workouts/measurement";
import { entityPayloadSchemas, parseEntityPayload } from "../../src/modules/sync/dto";
import type { WorkoutExercisePrescription, WorkoutSetLog } from "../../src/db/schema/types";

const base = { source: "manual", startedAt: "2026-10-26T00:00:00Z", finishedAt: "2026-10-26T00:30:00Z" };
const exercise: WorkoutExercisePrescription = { id: "hold", mode: "gym", idLabel: "Hold", enLabel: "Hold", requirements: [[]], sets: 1,
  reps: null, trackingType: "duration", targetDurationSeconds: 30, targetWeightKg: null,
  muscleTargets: { version: "1", primary: ["abs"], secondary: ["obliques"] } };
const log: WorkoutSetLog = { exerciseId: "hold", exerciseMode: "gym", setNumber: 1, completed: true, reps: null, weightKg: null, durationSeconds: 20 };

test("v2 retains explicit elapsed duration and muscles without calorie inputs or profile dependency", () => {
  const metrics = (input: Parameters<typeof buildResultMetrics>[0]) => buildResultMetrics(input, "gym", [exercise], [log]);
  const unknown = metrics(base); assert.equal(unknown.duration.seconds, null); assert.equal(unknown.duration.reason, "NOT_RECORDED");
  const timer = metrics({ ...base, sessionTiming: { source: "timer" } });
  assert.equal(timer.duration.seconds, 1800); assert.equal(timer.duration.source, "timer"); assert.equal(timer.version, "2");
  assert.deepEqual(Object.keys(timer).sort(), ["duration", "muscles", "version"]);
  assert.ok(currentResultMetricsSchema.safeParse(timer).success);
  assert.equal(currentResultMetricsSchema.safeParse({ ...timer, energy: { kcal: 100 } }).success, false);
  const manual = metrics({ ...base, sessionTiming: { source: "user_reported", durationSeconds: 600 } });
  assert.equal(manual.duration.seconds, 600); assert.equal(manual.duration.source, "user_reported");
  assert.equal(manual.duration.meaning, "elapsed_including_rest");
  const timed = { ...base, sessionTiming: { source: "timer" as const } };
  const old = metrics({ ...timed, startedAt: "2025-01-01T00:00:00Z", finishedAt: "2025-01-01T00:30:00Z" });
  assert.equal(old.duration.seconds, 1800, "Historical manual records do not require bodyweight");
  assert.equal(metrics({ ...timed, finishedAt: "2026-10-26T05:00:00Z" }).duration.seconds, 18000, "Retired energy scope must not limit elapsed duration");
  assert.equal(metrics({ ...timed, finishedAt: "2026-10-26T00:30:00.900Z" }).duration.seconds, 1800);
  assert.throws(() => metrics({ ...base, source: "custom", sessionTiming: { source: "user_reported", durationSeconds: 600 } }));
  assert.throws(() => metrics({ ...base, sessionTiming: { source: "timer" }, finishedAt: base.startedAt }));
  assert.throws(() => metrics({ ...timed, finishedAt: "2026-10-26T12:00:01Z" }));
  assert.throws(() => metrics({ ...base, sessionTiming: { source: "user_reported", durationSeconds: 10 } }));
  assert.equal(buildResultMetrics(timed, "gym", [exercise], []).muscles.coverage, "unknown");
});

test("legacy calorie snapshots remain readable and immutable, but new metrics never emit energy", () => {
  const current = buildResultMetrics(base, "gym", [exercise], [log]);
  const old = { ...current, version: "1", energy: { kcal: 128.6, method: "standard_met_gross_v1", activityCode: "02054", bodyweightKg: 70 } };
  const original = JSON.stringify(old);
  assert.deepEqual(resultMetricsSchema.parse(old), old);
  assert.ok(resultMetricsSchema.safeParse(current).success);
  assert.equal(JSON.stringify(old), original);
  assert.equal("energy" in current, false);
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
