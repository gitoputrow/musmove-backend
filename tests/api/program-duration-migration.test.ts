import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";

test("optional program duration migration preserves historical data and permits null", async () => {
  const db = new PGlite();
  try {
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
    for (const migration of migrations.slice(0, 28)) await db.exec(migration.sql.join("\n"));
    const user = randomUUID();
    await db.query("INSERT INTO users(id,issuer,subject) VALUES($1::uuid,'synthetic',$1::text)", [user]);
    const exercise = [{ id: "press", idLabel: "Press", enLabel: "Press", sets: 2, reps: 8, targetWeightKg: null, requirements: [["dumbbell"]] }];
    await db.query("INSERT INTO custom_programs(user_id,id,mode,name,duration_minutes,exercise_prescriptions) VALUES ($1,'old','gym','Old',45,$2::jsonb)", [user, JSON.stringify(exercise)]);
    const before = (await db.query("SELECT * FROM custom_programs WHERE id='old'")).rows;
    await db.exec(migrations[28].sql.join("\n"));
    assert.deepEqual((await db.query("SELECT * FROM custom_programs WHERE id='old'")).rows, before);
    await db.query("INSERT INTO custom_programs(user_id,id,mode,name,exercise_prescriptions) VALUES ($1,'new','gym','New',$2::jsonb)", [user, JSON.stringify(exercise)]);
    assert.equal((await db.query<{ duration_minutes: number | null }>("SELECT duration_minutes FROM custom_programs WHERE id='new'")).rows[0].duration_minutes, null);
    await assert.rejects(db.query("UPDATE custom_programs SET duration_minutes=1 WHERE id='new'"));
  } finally { await db.close(); }
});
