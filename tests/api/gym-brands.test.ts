import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Database } from "../../src/db/client";
import * as schema from "../../src/db/schema";
import { getGymBrands, getPlaceCatalog } from "../../src/modules/places/service";
import { placesQuerySchema } from "../../src/modules/places/query";
import { GET, OPTIONS } from "../../app/api/v1/catalog/places/brands/route";

test("public gym brands reflect active catalog rows, normalization and future brands", async () => {
  const env = { ...process.env };
  const globals = globalThis as unknown as { musmoveDatabase?: Database; musmovePool?: unknown };
  const previousDb = globals.musmoveDatabase, previousPool = globals.musmovePool;
  const local = new PGlite();
  Object.assign(process.env, { NODE_ENV: "test" }); delete process.env.VERCEL;
  globals.musmovePool = { query() { throw new Error("Live database forbidden in isolated test"); } };
  try {
    for (const migration of readMigrationFiles({ migrationsFolder: "drizzle" })) {
      await local.exec(migration.sql.join("\n"));
    }
    const db = drizzle(local, { schema });
    globals.musmoveDatabase = db as unknown as Database;
    const response = await GET(new Request("http://localhost/api/v1/catalog/places/brands"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.ok(response.headers.get("x-request-id"));
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    const body = await response.json();
    const version = (await local.query<{ version: string }>("SELECT version::text FROM catalog_state WHERE name='places'")).rows[0].version;
    assert.deepEqual(body, {
      catalogVersion: version,
      brands: [
        { id: "anytime_fitness", name: "Anytime Fitness", placeCount: 30 },
        { id: "fithub", name: "FIT HUB", placeCount: 36 },
        { id: "fitness_first", name: "Fitness First", placeCount: 9 },
        { id: "ftl", name: "FTL", placeCount: 24 },
      ],
      total: 4,
    });
    for (const query of ["area=Jakarta", "limit=1", "userId=someone", "brand=fithub", "area=a&area=b", "__proto__=a"]) {
      assert.equal((await GET(new Request(`http://localhost/api/v1/catalog/places/brands?${query}`))).status, 400, query);
    }
    const options = await OPTIONS(new Request("http://localhost/api/v1/catalog/places/brands", { method: "OPTIONS" }));
    assert.equal(options.status, 204);
    assert.equal(options.headers.get("access-control-allow-methods"), "GET, OPTIONS");

    await local.query("UPDATE place_catalog SET brand=' FiThUb ' WHERE id=(SELECT id FROM place_catalog WHERE brand='fithub' LIMIT 1)");
    assert.deepEqual((await getGymBrands()).brands, body.brands);
    assert.equal((await getPlaceCatalog(placesQuerySchema.parse({ brand: "fithub" }))).total, 36);

    const [template] = await db.select().from(schema.placeCatalog).limit(1);
    for (const brand of ["synthetic_new_brand", "constructor"]) {
      await db.insert(schema.placeCatalog).values({ ...template, id: `synthetic-${brand}`, name: brand, mode: "gym", gymCategory: "brand", brand });
    }
    const expanded = await getGymBrands();
    assert.equal(expanded.total, 6);
    for (const id of ["synthetic_new_brand", "constructor"]) {
      assert.deepEqual(expanded.brands.find(b => b.id === id), { id, name: id, placeCount: 1 });
      assert.equal((await getPlaceCatalog(placesQuerySchema.parse({ brand: id }))).total, 1);
    }
    await local.query("UPDATE place_catalog SET active=false WHERE brand='ftl'");
    const reduced = await getGymBrands();
    assert.equal(reduced.total, 5);
    assert.ok(!reduced.brands.some(b => b.id === "ftl"));
    assert.ok(BigInt(reduced.catalogVersion) > BigInt(version));
    await local.query("UPDATE place_catalog SET active=false WHERE mode='gym' AND gym_category='brand'");
    const empty = await GET(new Request("http://localhost/api/v1/catalog/places/brands"));
    assert.equal(empty.status, 200);
    assert.deepEqual(await empty.json(), { catalogVersion: (await getGymBrands()).catalogVersion, brands: [], total: 0 });
    assert.equal((await getPlaceCatalog(placesQuerySchema.parse({}))).total, 6);
  } finally {
    globals.musmoveDatabase = previousDb; globals.musmovePool = previousPool;
    process.env = env; await local.close();
  }
});
