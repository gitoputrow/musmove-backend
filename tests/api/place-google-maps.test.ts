import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Database } from "../../src/db/client";
import * as schema from "../../src/db/schema";
import links from "../../src/db/data/place-google-maps-2026-11-14.json";
import journal from "../../drizzle/meta/_journal.json";
import { getPlaceCatalog } from "../../src/modules/places/service";
import { placesQuerySchema } from "../../src/modules/places/query";
import { GET } from "../../app/api/v1/catalog/places/route";

test("Maps migration updates all coordinate links without changing place attributes, favorites or newer links", async () => {
  const env = { ...process.env };
  const globals = globalThis as unknown as { musmoveDatabase?: Database; musmovePool?: unknown };
  const previousDb = globals.musmoveDatabase, previousPool = globals.musmovePool;
  const local = new PGlite();
  Object.assign(process.env, { NODE_ENV: "test" }); delete process.env.VERCEL;
  globals.musmovePool = { query() { throw new Error("Live database forbidden in isolated test"); } };
  try {
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
    const timestamp = journal.entries.find(e => e.tag === "0037_place_google_maps_profiles")!.when;
    const index = migrations.findIndex(m => m.folderMillis === timestamp); assert.ok(index > 0);
    for (const migration of migrations.slice(0, index)) await local.exec(migration.sql.join("\n"));
    const migration = migrations[index];
    assert.ok(migration.sql.join("\n").includes("$place_map_links$"));
    const db = drizzle(local, { schema });
    globals.musmoveDatabase = db as unknown as Database;
    const userId = randomUUID();
    await local.query("INSERT INTO users(id,issuer,subject) VALUES($1::uuid,'synthetic',$1::text)", [userId]);
    await local.query("INSERT INTO place_favorites(user_id,place_id,version) VALUES($1,'jakarta-ftl-mampang',7)", [userId]);
    const favorites = (await local.query("SELECT * FROM place_favorites")).rows;

    await local.exec("BEGIN");
    await local.query("UPDATE place_catalog SET google_maps_url='https://www.google.com/maps/?cid=123456789' WHERE id='jakarta-ftl-mampang'");
    const custom = (await local.query("SELECT * FROM place_catalog WHERE id='jakarta-ftl-mampang'")).rows[0];
    await local.exec(migration.sql.join("\n"));
    assert.deepEqual((await local.query("SELECT * FROM place_catalog WHERE id='jakarta-ftl-mampang'")).rows[0], custom);
    await local.exec("ROLLBACK");

    const before = await db.select().from(schema.placeCatalog);
    const [stateBefore] = (await local.query<{ version: string }>("SELECT version::text FROM catalog_state WHERE name='places'")).rows;
    assert.equal(before.length, 105);
    await local.exec(migration.sql.join("\n"));
    const after = await db.select().from(schema.placeCatalog);
    assert.equal(after.length, 105);
    let profiles = 0, searches = 0;
    for (const current of after) {
      const original = before.find(p => p.id === current.id)!;
      const update = links.places.find(p => p.id === current.id);
      if (!update) {
        assert.equal(current.id, "jakarta-musclebound-epfc");
        assert.deepEqual(current, original);
      } else {
        assert.equal(current.googleMapsUrl, update.googleMapsUrl);
        assert.equal(current.version, original.version + BigInt(1));
        for (const key of Object.keys(original) as (keyof typeof original)[]) {
          if (!["googleMapsUrl", "sources", "version", "updatedAt"].includes(key)) assert.deepEqual(current[key], original[key], `${current.id}.${key}`);
        }
        for (const source of original.sources) assert.ok(current.sources.some(s => s.url === source.url));
        assert.equal(new Set(current.sources.map(s => s.url)).size, current.sources.length);
      }
      const url = new URL(current.googleMapsUrl);
      const cid = url.searchParams.get("cid");
      if (cid) {
        profiles++;
        assert.match(cid, /^[1-9]\d*$/);
        assert.equal(current.googleMapsUrl, `https://www.google.com/maps/?cid=${cid}`);
        if (update?.featureId) assert.equal(BigInt(update.featureId.split(":")[1]).toString(), cid);
      } else {
        searches++;
        assert.equal(update?.resolution, "name_address_search");
        assert.equal(url.searchParams.get("query"), `${current.name} ${current.address}`);
      }
    }
    assert.equal(profiles, 102); assert.equal(searches, 3);
    assert.deepEqual((await local.query("SELECT * FROM place_favorites")).rows, favorites);
    const catalog = await getPlaceCatalog(placesQuerySchema.parse({ q: "FTL Gym Mampang" }), userId);
    assert.equal(catalog.total, 1); assert.equal(catalog.places[0].isFavorite, true);
    assert.equal(catalog.places[0].favoriteVersion, "7");
    assert.equal(catalog.places[0].googleMapsUrl, "https://www.google.com/maps/?cid=16806278859894474600");
    assert.ok(BigInt(catalog.catalogVersion) > BigInt(stateBefore.version));
    const response = await GET(new Request("http://localhost/api/v1/catalog/places?brand=ftl"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.total, 24);
    assert.equal(body.places.find((p: { id: string }) => p.id === "jakarta-ftl-mampang").googleMapsUrl, catalog.places[0].googleMapsUrl);
    assert.ok(body.places.every((p: object) => !("isFavorite" in p)));
    await local.exec(migration.sql.join("\n"));
    assert.deepEqual(await db.select().from(schema.placeCatalog), after);
    assert.equal((await getPlaceCatalog(placesQuerySchema.parse({}))).catalogVersion, catalog.catalogVersion);
  } finally {
    globals.musmoveDatabase = previousDb; globals.musmovePool = previousPool;
    process.env = env; await local.close();
  }
});
