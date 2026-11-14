import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { entityPayloadSchemas, syncPushSchema } from "../../src/modules/sync/dto";
import { accountPatchSchema } from "../../src/modules/online/dto";
import { demoImportSchema } from "../../src/modules/imports/demo";

test("retired meals and budget inputs reject while area preferences remain writable", () => {
  const retired = { entityType: "meal_entry", entityId: "old", payload: {} };
  assert.equal(syncPushSchema.safeParse({ schemaVersion: 1, deviceId: "test", operations: [
    { ...retired, action: "upsert", baseVersion: "0", operationId: randomUUID() },
  ] }).success, false);
  assert.equal(demoImportSchema.safeParse({ schemaVersion: 1, importId: randomUUID(), entities: [retired] }).success, false);
  assert.deepEqual(entityPayloadSchemas.user_preferences.parse({ placesArea: "Jakarta" }), { placesArea: "Jakarta" });
  for (const fields of [{ budgetRupiah: 50000 }, { budgetIsManual: false }]) {
    assert.equal(entityPayloadSchemas.user_preferences.safeParse({ placesArea: null, ...fields }).success, false);
    assert.equal(accountPatchSchema.safeParse({ baseVersions: { userPreferences: "0" }, userPreferences: fields }).success, false);
  }
});

test("removal migration clears retired storage and cached data, preserving other account data", async () => {
  const db = new PGlite();
  try {
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
    const index = migrations.findIndex(m => m.folderMillis === 1791657682452);
    assert.ok(index > 0);
    for (const migration of migrations.slice(0, index)) await db.exec(migration.sql.join("\n"));
    const user = randomUUID(), epoch = randomUUID(), snapshot = randomUUID();
    await db.query("INSERT INTO users(id,issuer,subject) VALUES($1::uuid,'synthetic',$1::text)", [user]);
    await db.query("INSERT INTO sync_state(user_id,epoch,next_sequence) VALUES($1,$2,4)", [user, epoch]);
    await db.query("INSERT INTO user_preferences(user_id,budget_rupiah,budget_is_manual,places_area,version) VALUES($1,50000,true,'Jakarta',7)", [user]);
    await db.query("INSERT INTO meal_entries(user_id,id,snapshot) VALUES($1,'old','{}')", [user]);
    await db.query("INSERT INTO social_drafts(user_id,id,body) VALUES($1,'keep','private')", [user]);
    for (const [sequence, type, payload] of [
      [1, "meal_entry", { menuName: "old" }],
      [2, "user_preferences", { budgetRupiah: 50000, budgetIsManual: true, placesArea: "Jakarta" }],
      [3, "social_draft", { body: "private", metadata: null }],
    ] as const) {
      await db.query("INSERT INTO sync_changes(user_id,sequence,entity_type,entity_id,entity_version,operation,payload) VALUES($1,$2,$3,'id',1,'upsert',$4)", [user, sequence, type, JSON.stringify(payload)]);
    }
    const results = [
      { entityType: "meal_entry", version: "1" },
      { kind: "online.v1:meal_entry.create", response: { item: { menuName: "old" } } },
      { kind: "online.v1:meal_entry.patch:old", response: { item: { menuName: "old" } } },
      { kind: "online.v1:me.patch", response: { userPreferences: { budgetRupiah: 50000, budgetIsManual: true, placesArea: "Jakarta", version: "7" } } },
      { kind: "online.v1:social_draft.create", response: { item: { body: "private" } } },
    ];
    for (const result of results) {
      await db.query("INSERT INTO operation_receipts(user_id,operation_id,request_hash,result) VALUES($1,$2,$3,$4)", [user, randomUUID(), "a".repeat(64), JSON.stringify(result)]);
    }
    await db.query("INSERT INTO sync_snapshots(id,user_id,epoch,sequence,total,expires_at) VALUES($1,$2,$3,3,1,now()+interval '1 hour')", [snapshot, user, epoch]);
    await db.query("INSERT INTO sync_snapshot_items(snapshot_id,position,entity_type,entity_id,version,updated_at,payload) VALUES($1,1,'meal_entry','old',1,now(),'{}')", [snapshot]);
    const drafts = (await db.query("SELECT * FROM social_drafts")).rows;
    await db.exec(migrations[index].sql.join("\n"));
    assert.deepEqual((await db.query("SELECT * FROM social_drafts")).rows, drafts);
    assert.deepEqual((await db.query("SELECT places_area,version::text FROM user_preferences")).rows, [{ places_area: "Jakarta", version: "7" }]);
    assert.deepEqual((await db.query<{ payload: unknown }>("SELECT payload FROM sync_changes ORDER BY sequence")).rows.map(r => r.payload), [{ placesArea: "Jakarta" }, { body: "private", metadata: null }]);
    assert.deepEqual((await db.query<{ result: unknown }>("SELECT result FROM operation_receipts ORDER BY result->>'kind'")).rows.map(r => r.result), [
      { kind: "online.v1:me.patch", response: { userPreferences: { placesArea: "Jakarta", version: "7" } } }, results[4],
    ]);
    assert.deepEqual((await db.query("SELECT to_regclass('meal_entries') AS entries,to_regclass('meal_catalog') AS catalog,to_regprocedure('update_meal_catalog_row()') AS row_trigger,to_regprocedure('bump_meal_catalog_version()') AS catalog_trigger")).rows, [{ entries: null, catalog: null, row_trigger: null, catalog_trigger: null }]);
    assert.equal((await db.query("SELECT 1 FROM information_schema.columns WHERE table_name='user_preferences' AND column_name IN ('budget_rupiah','budget_is_manual')")).rows.length, 0);
    assert.equal((await db.query("SELECT 1 FROM catalog_state WHERE name='meals'")).rows.length, 0);
    assert.equal((await db.query("SELECT 1 FROM sync_snapshot_items")).rows.length, 0);
    assert.equal((await db.query("SELECT 1 FROM sync_snapshots")).rows.length, 0);
    const state = (await db.query<{ epoch: string; next_sequence: string }>("SELECT epoch,next_sequence::text FROM sync_state")).rows[0];
    assert.notEqual(state.epoch, epoch);
    assert.equal(state.next_sequence, "4");
    assert.ok((await db.query<{ name: string | null }>("SELECT to_regclass('nutrition_estimates') AS name")).rows[0].name);
  } finally { await db.close(); }
});
