import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Database } from "../../src/db/client";
import * as schema from "../../src/db/schema";
import { getPlaceCatalog } from "../../src/modules/places/service";
import { placesQuerySchema } from "../../src/modules/places/query";
import { GET } from "../../app/api/v1/catalog/places/route";

const ftlHours = [{ labelID: "Setiap Hari", labelEN: "All Day", hours: "24 jam" }];
const fitHubHours = [
  { labelID: "Senin - Jumat", labelEN: "Monday - Friday", hours: "05.00 - 00.00" },
  { labelID: "Sabtu, Minggu dan Libur Nasional", labelEN: "Saturday, Sunday and Public Holidays", hours: "06.00 - 21.00" },
];

test("JSON opening hours migration preserves places/favorites and exposes owner-supplied schedules in the API", async () => {
  const env = { ...process.env };
  const globalDb = globalThis as unknown as { musmoveDatabase?: Database; musmovePool?: unknown };
  const previousDb = globalDb.musmoveDatabase, previousPool = globalDb.musmovePool;
  const local = new PGlite();
  Object.assign(process.env, { NODE_ENV: "test" });
  delete process.env.VERCEL;
  globalDb.musmovePool = { query() { throw new Error("Live database forbidden in isolated test"); } };
  try {
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    const timestamp = journal.entries.find((e: { tag: string }) => e.tag === "0033_place_opening_hours_json").when;
    const index = migrations.findIndex(m => m.folderMillis === timestamp);
    assert.ok(index > 0);
    for (const migration of migrations.slice(0, index)) await local.exec(migration.sql.join("\n"));
    const user = randomUUID();
    await local.query("INSERT INTO users(id,issuer,subject) VALUES($1::uuid,'synthetic',$1::text)", [user]);
    await local.query("INSERT INTO place_favorites(user_id,place_id,version) VALUES($1,'jakarta-ftl-tebet',3)", [user]);
    const favorites = (await local.query("SELECT * FROM place_favorites")).rows;
    const before = (await local.query<{ record: Record<string, unknown>; version: string; brand: string | null }>(
      "SELECT to_jsonb(p)-'opening_hours'-'version'-'updated_at' AS record,version::text,brand FROM place_catalog p ORDER BY id",
    )).rows;
    const versionBefore = (await local.query<{ version: string }>("SELECT version::text FROM catalog_state WHERE name='places'")).rows[0].version;
    for (const statement of migrations[index].sql) await local.exec(statement);
    const after = (await local.query<{ record: Record<string, unknown>; version: string }>(
      "SELECT to_jsonb(p)-'opening_hours'-'version'-'updated_at' AS record,version::text FROM place_catalog p ORDER BY id",
    )).rows;
    assert.deepEqual(after.map(r => r.record), before.map(r => r.record));
    for (let i = 0; i < before.length; i++) {
      const changed = before[i].brand === "ftl" || before[i].brand === "fithub";
      assert.equal(BigInt(after[i].version), BigInt(before[i].version) + BigInt(changed ? 1 : 0));
    }
    assert.deepEqual((await local.query("SELECT * FROM place_favorites")).rows, favorites);
    const versionAfter = (await local.query<{ version: string }>("SELECT version::text FROM catalog_state WHERE name='places'")).rows[0].version;
    assert.equal(BigInt(versionAfter), BigInt(versionBefore) + BigInt(1));

    globalDb.musmoveDatabase = drizzle(local, { schema }) as unknown as Database;
    const response = await GET(new Request("http://localhost/api/v1/catalog/places"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.total, 18);
    assert.equal(body.catalogVersion, versionAfter);
    assert.equal(body.places.filter((p: { brand: string }) => p.brand === "ftl").length, 3);
    assert.equal(body.places.filter((p: { brand: string }) => p.brand === "fithub").length, 10);
    assert.equal(body.places.filter((p: { openingHours: unknown }) => p.openingHours === null).length, 5);
    for (const p of body.places) assert.deepEqual(p.openingHours, p.brand === "ftl" ? ftlHours : p.brand === "fithub" ? fitHubHours : null);
    const own = await getPlaceCatalog(placesQuerySchema.parse({ brand: "ftl" }), user);
    assert.equal(own.places.length, 3);
    for (const p of own.places) assert.deepEqual(p.openingHours, ftlHours);
    const favorite = own.places.find(p => p.id === "jakarta-ftl-tebet")!;
    assert.equal(favorite.isFavorite, true);
    assert.equal(favorite.favoriteVersion, "3");
    for (const value of ["24 jam", {}, [], [null], ["24 jam"], [{}],
      [{ labelID: "Setiap Hari", labelEN: "All Day" }],
      [{ ...ftlHours[0], labelID: "   " }], [{ ...ftlHours[0], hours: 24 }],
      [{ ...ftlHours[0], labelEN: null }], [{ ...ftlHours[0], extra: "unknown" }]]) {
      await assert.rejects(local.query("UPDATE place_catalog SET opening_hours=$1::jsonb WHERE id='jakarta-ftl-tebet'", [JSON.stringify(value)]));
    }
    await local.query("UPDATE place_catalog SET opening_hours=NULL WHERE id='jakarta-ftl-tebet'");
    assert.equal((await getPlaceCatalog(placesQuerySchema.parse({ brand: "ftl" }))).places.find(p => p.id === "jakarta-ftl-tebet")!.openingHours, null);
  } finally {
    globalDb.musmoveDatabase = previousDb;
    globalDb.musmovePool = previousPool;
    process.env = env;
    await local.close();
  }
});
