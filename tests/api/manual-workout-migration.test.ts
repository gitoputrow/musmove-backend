import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { completedWorkoutSchema } from "../../src/modules/online/dto";

test("workout-only mode migration preserves legacy rows, snapshots, receipts and preferences; training_mode never gains mixed", async () => {
  const local = new PGlite();
  try {
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
    for (const migration of migrations.slice(0, 23)) await local.exec(migration.sql.join("\n"));
    const userId = randomUUID(), operationId = randomUUID();
    await local.query("INSERT INTO users(id,issuer,subject) VALUES($1::uuid,$2,$1::text)", [userId, "synthetic"]);
    await local.query("INSERT INTO training_preferences(user_id,mode,no_equipment,version) VALUES($1,$2,true,7)", [userId, "gym"]);
    await local.query("INSERT INTO profiles(user_id,focus,training_level,version) VALUES($1,$2,$3,9)", [userId, "chest", "intermediate"]);
    const snapshot = [{ id: "squat", idLabel: "Historical name", enLabel: "Historical name", requirements: [[]], sets: 2, reps: 10, targetWeightKg: 10 }];
    const logs = [{ exerciseId: "squat", setNumber: 1, completed: true, reps: 10, weightKg: 10 }, { exerciseId: "squat", setNumber: 2, completed: true, reps: 8, weightKg: 12 }];
    for (const [id, mode, status] of [["old-gym", "gym", "completed"], ["old-cali", "calisthenics", "aborted"], ["old-active", "gym", "active"]]) {
      await local.query(`INSERT INTO workout_sessions(user_id,id,plan_id,mode,status,started_at,finished_at,recorded_on,exercise_snapshot,set_log,legacy_metadata,version)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,11)`,
      [userId, id, "legacy-program", mode, status, "2026-10-20T00:00:00Z", status === "active" ? null : "2026-10-20T00:30:00Z", "2026-10-20", JSON.stringify(snapshot), JSON.stringify(logs), JSON.stringify({ source: "custom", note: "Historical note" })]);
    }
    await local.query("INSERT INTO operation_receipts(user_id,operation_id,request_hash,result) VALUES($1,$2,$3,$4::jsonb)", [userId, operationId, "0".repeat(64), JSON.stringify({ kind: "old", response: { item: { mode: "gym", exerciseSnapshot: snapshot, setLog: logs } } })]);
    const tables = ["workout_sessions", "profiles", "training_preferences", "operation_receipts"];
    const before = await Promise.all(tables.map(table => local.query(`SELECT * FROM ${table} ORDER BY user_id`)));
    await local.exec("BEGIN;"); await local.exec(migrations[23].sql.join("\n")); await local.exec("COMMIT;");
    for (const [i, table] of tables.entries()) assert.deepEqual((await local.query(`SELECT * FROM ${table} ORDER BY user_id`)).rows, before[i].rows);
    const enums = await local.query<{ typname: string; values: string[] }>(`SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
      FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname IN ('training_mode','workout_mode') GROUP BY t.typname`);
    assert.deepEqual(enums.rows.find(r => r.typname === "training_mode")!.values, ["gym", "calisthenics"]);
    assert.deepEqual(enums.rows.find(r => r.typname === "workout_mode")!.values, ["gym", "calisthenics", "mixed"]);
    await assert.rejects(local.query("UPDATE training_preferences SET mode=$2 WHERE user_id=$1", [userId, "mixed"]));
    await assert.rejects(local.query("UPDATE workout_sessions SET mode=$2 WHERE user_id=$1 AND id=$3", [userId, "mixed", "old-gym"]));
  } finally { await local.close(); }
});

test("new manual format requires complete mode-qualified references, while program and legacy request contracts stay strict", () => {
  const p = { id: "squat", idLabel: "Squat", enLabel: "Squat", requirements: [[]], sets: 1, reps: 8, targetWeightKg: null };
  const base = { id: "manual", source: "manual", startedAt: "2026-10-20T00:00:00Z", finishedAt: "2026-10-20T00:30:00Z", recordedOn: "2026-10-20", exerciseSnapshot: [p], setLog: [] };
  assert.equal(completedWorkoutSchema.safeParse({ ...base, mode: "gym" }).success, true);
  assert.equal(completedWorkoutSchema.safeParse(base).success, false);
  assert.equal(completedWorkoutSchema.safeParse({ ...base, exerciseSnapshot: [{ ...p, mode: "gym" }] }).success, true);
  assert.equal(completedWorkoutSchema.safeParse({ ...base, source: "custom", programId: "p", exerciseSnapshot: [{ ...p, mode: "gym" }] }).success, false);
  assert.equal(completedWorkoutSchema.safeParse({ ...base, mode: "gym", exerciseSnapshot: [{ ...p, mode: "gym" }] }).success, false);
});
