import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";

test("activity migration preserves legacy profiles and estimates, adds optional routine and guards v3", async () => {
  const db = new PGlite();
  try {
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
    for (const migration of migrations.slice(0, 30)) await db.exec(migration.sql.join("\n"));
    const user = randomUUID();
    await db.query("INSERT INTO users(id,issuer,subject) VALUES($1::uuid,'synthetic',$1::text)", [user]);
    await db.query("INSERT INTO profiles(user_id,daily_activity,version) VALUES ($1,'moderate',3)", [user]);
    await db.query(`INSERT INTO nutrition_estimates(user_id,profile_version,formula_version,status,input_snapshot,reason_codes,resting_kcal,calories,protein_grams,protein_min,protein_max,normalized_goal,maintenance_calories,calorie_adjustment_kcal,protein_factor)
      VALUES ($1,3,'mifflin-pal-goals-v2','ready','{}','{}',1500,2200,112,98,140,'bulk',2000,200,1.6)`, [user]);
    const before = (await db.query("SELECT daily_activity,version,updated_at FROM profiles")).rows;
    const estimates = (await db.query("SELECT * FROM nutrition_estimates")).rows;
    await db.exec(migrations[30].sql.join("\n"));
    assert.deepEqual((await db.query("SELECT daily_activity,version,updated_at FROM profiles")).rows, before);
    assert.deepEqual((await db.query("SELECT * FROM nutrition_estimates")).rows, estimates);
    assert.equal((await db.query<{ activity_routine: unknown }>("SELECT activity_routine FROM profiles")).rows[0].activity_routine, null);
    await assert.rejects(db.query("UPDATE profiles SET activity_routine='[]'::jsonb"));
    await assert.rejects(db.query(`INSERT INTO nutrition_estimates(user_id,profile_version,formula_version,status,input_snapshot,reason_codes,resting_kcal,calories,protein_grams,protein_min,protein_max,normalized_goal,maintenance_calories,calorie_adjustment_kcal,protein_factor)
      VALUES ($1,3,'mifflin-routine-goals-v3','ready','{}','{}',1500,9999,112,98,140,'bulk',2000,200,1.6)`, [user]));
  } finally { await db.close(); }
});
