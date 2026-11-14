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

const data = JSON.parse(readFileSync("src/db/data/jakarta-chain-places-2026-11-14.json", "utf8"));

test("reviewed DKI chain expansion preserves IDs/favorites and serves complete branded catalogs", async () => {
  const env = { ...process.env };
  const globalDb = globalThis as unknown as { musmoveDatabase?: Database; musmovePool?: unknown };
  const previousDb = globalDb.musmoveDatabase, previousPool = globalDb.musmovePool;
  const local = new PGlite();
  Object.assign(process.env, { NODE_ENV: "test" }); delete process.env.VERCEL;
  globalDb.musmovePool = { query() { throw new Error("Live database forbidden in isolated test"); } };
  const query = (input: Record<string, string> = {}) => placesQuerySchema.parse(input);
  try {
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    const timestamp = journal.entries.find((e: { tag: string }) => e.tag === "0034_complete_jakarta_chain_places").when;
    const index = migrations.findIndex(m => m.folderMillis === timestamp); assert.ok(index > 0);
    for (const migration of migrations.slice(0, index)) await local.exec(migration.sql.join("\n"));
    const user = randomUUID();
    await local.query("INSERT INTO users(id,issuer,subject) VALUES($1::uuid,'synthetic',$1::text)", [user]);
    await local.query("INSERT INTO place_favorites(user_id,place_id,version) VALUES($1,'jakarta-ftl-tebet',7)", [user]);
    await local.exec("UPDATE place_catalog SET day_pass_available=true WHERE id='jakarta-ftl-tebet'");
    const favorites = (await local.query("SELECT * FROM place_favorites")).rows;
    const originalIds = (await local.query<{ id: string }>("SELECT id FROM place_catalog")).rows.map(p => p.id);
    const unchanged = (await local.query("SELECT * FROM place_catalog WHERE brand IS NULL ORDER BY id")).rows;
    const beforeVersion = (await local.query<{ version: string }>("SELECT version::text FROM catalog_state WHERE name='places'")).rows[0].version;
    for (const statement of migrations[index].sql) await local.exec(statement);
    globalDb.musmoveDatabase = drizzle(local, { schema }) as unknown as Database;
    const all = await getPlaceCatalog(query({ limit: "100" }), user);
    assert.equal(all.total, 95); assert.equal(all.places.length, 95); assert.equal(all.hasMore, false);
    assert.equal(new Set(all.places.map(p => p.id)).size, 95);
    assert.ok(originalIds.every(id => all.places.some(p => p.id === id)));
    assert.deepEqual((await local.query("SELECT * FROM place_catalog WHERE brand IS NULL ORDER BY id")).rows, unchanged);
    assert.deepEqual((await local.query("SELECT * FROM place_favorites")).rows, favorites);
    assert.ok(BigInt(all.catalogVersion) > BigInt(beforeVersion));
    const favorite = all.places.find(p => p.id === "jakarta-ftl-tebet")!;
    assert.equal(favorite.isFavorite, true); assert.equal(favorite.favoriteVersion, "7"); assert.equal(favorite.dayPassAvailable, true);
    for (const [brand, count] of Object.entries(data.counts)) {
      const group = await getPlaceCatalog(query({ brand, limit: "100" }));
      assert.equal(group.total, count); assert.equal(group.places.length, count);
      assert.ok(group.places.every(p => p.brand === brand && p.area === "Jakarta" && p.city.startsWith("Jakarta ") && p.checkedAt === data.checkedAt));
      assert.ok(group.places.every(p => p.sources.length > 0 && p.openingHours?.length === (brand === "fithub" ? 2 : 1)));
      for (const p of group.places) {
        const expected = data.places.find((r: { id: string }) => r.id === p.id);
        assert.ok(expected, p.id); assert.equal(p.address, expected.address); assert.equal(p.latitude, expected.latitude); assert.equal(p.longitude, expected.longitude);
        assert.deepEqual(p.openingHours, expected.opening_hours);
        assert.equal(new URL(p.googleMapsUrl).searchParams.get("query"), `${p.latitude},${p.longitude}`);
      }
    }
    assert.equal(all.places.find(p => p.id === "jakarta-ftl-kebon-sirih")!.latitude, -6.183565);
    assert.equal(all.places.find(p => p.id === "jakarta-ftl-tomang")!.longitude, 106.8012897);
    assert.equal(all.places.find(p => p.id === "jakarta-anytime-fitness-setiabudi-one")!.city, "Jakarta Selatan");
    assert.ok(!all.places.some(p => /osaka|kalibata city|lippo icon|stride|senayan park|artha gading|grand cakung/i.test(p.name)));
    const first = await getPlaceCatalog(query());
    assert.equal(first.places.length, 50); assert.equal(first.nextOffset, 50); assert.equal(first.hasMore, true);
    const second = await getPlaceCatalog(query({ offset: "50" }));
    assert.equal(second.places.length, 45); assert.equal(second.nextOffset, null);
    assert.deepEqual([...first.places, ...second.places].map(p => p.id), all.places.map(p => p.id));
    const response = await GET(new Request("http://localhost/api/v1/catalog/places?brand=anytime_fitness&limit=100"));
    assert.equal(response.status, 200);
    const body = await response.json(); assert.equal(body.total, 30);
    for (const p of body.places) assert.deepEqual(p.openingHours, [{ labelID: "Setiap Hari", labelEN: "All Day", hours: "24 jam" }]);
    assert.ok(body.places.every((p: Record<string, unknown>) => !("isFavorite" in p)));
  } finally {
    globalDb.musmoveDatabase = previousDb; globalDb.musmovePool = previousPool;
    process.env = env; await local.close();
  }
});
