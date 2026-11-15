import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Database } from "../../src/db/client";
import * as schema from "../../src/db/schema";
import { getPlaceCatalog } from "../../src/modules/places/service";
import { placesQuerySchema } from "../../src/modules/places/query";
import { GET } from "../../app/api/v1/catalog/places/route";

test("places search matches literal names/addresses before filters, distance and pagination, preserving favorites", async () => {
  const env = { ...process.env };
  const globals = globalThis as unknown as { musmoveDatabase?: Database; musmovePool?: unknown };
  const previousDb = globals.musmoveDatabase, previousPool = globals.musmovePool;
  const local = new PGlite();
  Object.assign(process.env, { NODE_ENV: "test" }); delete process.env.VERCEL;
  globals.musmovePool = { query() { throw new Error("Live database forbidden in isolated test"); } };
  try {
    for (const migration of readMigrationFiles({ migrationsFolder: "drizzle" })) await local.exec(migration.sql.join("\n"));
    const db = drizzle(local, { schema });
    globals.musmoveDatabase = db as unknown as Database;
    const search = (query: Record<string, string>, userId?: string) => getPlaceCatalog(placesQuerySchema.parse(query), userId);
    const musclebound = await search({ q: "  MUSCLEBOUND  " });
    assert.equal(musclebound.total, 1);
    assert.equal(musclebound.places[0].id, "jakarta-musclebound-epfc");
    assert.ok((await search({ q: "Jatinegara Kaum" })).places.some(p => p.id === "jakarta-musclebound-epfc"));

    const [template] = await db.select().from(schema.placeCatalog).limit(1);
    await local.query("UPDATE place_catalog SET active=false");
    for (const [suffix, brand, latitude, active, address] of [
      ["Alpha", "ftl", -6.2, true, "Needle Avenue 100%_\\ Lane"],
      ["Beta", "ftl", -6.201, true, "Other Street"],
      ["Gamma", "fithub", -6.8, true, "Far Street"],
      ["Hidden", "ftl", -6.2, false, "Hidden Street"],
    ] as const) {
      await db.insert(schema.placeCatalog).values({
        ...template, id: `search-${suffix}`, name: `Search Fixture ${suffix}`, mode: "gym", gymCategory: "brand",
        brand, latitude, longitude: 106.8, active, address, area: "Jakarta", city: "Jakarta Timur",
        accessModel: "membership", dayPassAvailable: true,
      });
    }
    for (const [offset, id, hasMore, nextOffset] of [["0", "Alpha", true, 1], ["1", "Beta", true, 2], ["2", "Gamma", false, null]] as const) {
      const response = await GET(new Request(`http://localhost/api/v1/catalog/places?q=SEARCH%20FIXTURE&limit=1&offset=${offset}`));
      assert.equal(response.status, 200);
      const page = await response.json();
      assert.equal(page.total, 3); assert.equal(page.places.length, 1);
      assert.equal(page.places[0].id, `search-${id}`);
      assert.equal(page.hasMore, hasMore); assert.equal(page.nextOffset, nextOffset);
      assert.ok(!("isFavorite" in page.places[0]));
    }
    assert.equal((await search({ q: "Search Fixture", brand: "ftl", city: "Jakarta Timur", dayPassAvailable: "true" })).total, 2);
    assert.equal((await search({ q: "Search Fixture", mode: "calisthenics" })).total, 0);
    const nearby = await search({ q: "Search Fixture", latitude: "-6.2", longitude: "106.8", radiusKm: "1", limit: "1" });
    assert.equal(nearby.total, 2); assert.equal(nearby.places[0].id, "search-Alpha");
    assert.equal(nearby.distanceType, "straight_line"); assert.equal(nearby.nextOffset, 1);
    for (const q of ["nEEdle avenue", "%", "_", "\\", "100%_\\"]) {
      const result = await search({ q });
      assert.equal(result.total, 1, q); assert.equal(result.places[0].id, "search-Alpha");
    }
    for (const q of ["does-not-exist", "' OR 1=1 --", "Search Fixture Hidden"]) {
      const result = await search({ q });
      assert.deepEqual(result.places, []); assert.equal(result.total, 0);
      assert.equal(result.hasMore, false); assert.equal(result.nextOffset, null);
    }
    for (const query of ["q=", "q=%20%20", `q=${"a".repeat(161)}`, "q=a&q=b"]) {
      assert.equal((await GET(new Request(`http://localhost/api/v1/catalog/places?${query}`))).status, 400);
    }
    const userId = randomUUID();
    await local.query("INSERT INTO users(id,issuer,subject) VALUES($1::uuid,'synthetic',$1::text)", [userId]);
    await local.query("INSERT INTO place_favorites(user_id,place_id,version) VALUES($1,'search-Beta',7)", [userId]);
    const privateResult = await search({ q: "fixture beta" }, userId);
    assert.equal(privateResult.total, 1); assert.equal(privateResult.places[0].isFavorite, true);
    assert.equal(privateResult.places[0].favoriteVersion, "7");
    assert.equal((await search({})).total, 3);
  } finally {
    globals.musmoveDatabase = previousDb; globals.musmovePool = previousPool;
    process.env = env; await local.close();
  }
});
