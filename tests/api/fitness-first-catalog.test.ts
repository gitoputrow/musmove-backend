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

test("nine Fitness First clubs retain screenshot hours and existing places/favorites across the migration", async () => {
  const env = { ...process.env };
  const globals = globalThis as unknown as { musmoveDatabase?: Database; musmovePool?: unknown };
  const previousDb = globals.musmoveDatabase, previousPool = globals.musmovePool;
  const local = new PGlite();
  Object.assign(process.env, { NODE_ENV: "test" }); delete process.env.VERCEL;
  globals.musmovePool = { query() { throw new Error("Live database forbidden in isolated test"); } };
  try {
    const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    const timestamp = journal.entries.find((r: { tag: string }) => r.tag === "0035_fitness_first_jakarta").when;
    const index = migrations.findIndex(r => r.folderMillis === timestamp); assert.ok(index > 0);
    for (const migration of migrations.slice(0, index)) await local.exec(migration.sql.join("\n"));
    const before = (await local.query("SELECT * FROM place_catalog ORDER BY id")).rows;
    assert.equal(before.length, 95);
    const user = randomUUID();
    await local.query("INSERT INTO users(id,issuer,subject) VALUES($1::uuid,'synthetic',$1::text)", [user]);
    const oakwood = "jakarta-fitness-first-oakwood-mega-kuningan";
    for (const id of ["jakarta-ftl-tebet", oakwood]) await local.query("INSERT INTO place_favorites(user_id,place_id,version) VALUES($1,$2,7)", [user, id]);
    const favorites = (await local.query("SELECT * FROM place_favorites ORDER BY place_id")).rows;
    const versionBefore = (await local.query<{ version: string }>("SELECT version::text FROM catalog_state WHERE name='places'")).rows[0].version;
    for (const statement of migrations[index].sql) await local.exec(statement);
    assert.deepEqual((await local.query("SELECT * FROM place_catalog WHERE brand IS DISTINCT FROM 'fitness_first' ORDER BY id")).rows, before);
    assert.deepEqual((await local.query("SELECT * FROM place_favorites ORDER BY place_id")).rows, favorites);
    globals.musmoveDatabase = drizzle(local, { schema }) as unknown as Database;
    const result = await getPlaceCatalog(placesQuerySchema.parse({ brand: "fitness_first" }), user);
    assert.equal(result.total, 9); assert.equal(result.places.length, 9);
    assert.ok(BigInt(result.catalogVersion) > BigInt(versionBefore));
    const expected = {
      "Grand Indonesia": ["06.00 - 22.30", "06.00 - 21.30", "08.00 - 20.00"],
      "Senayan City": ["06.00 - 22.00", "06.00 - 21.30", "08.00 - 20.00"],
      "Pacific Place": ["06.00 - 22.30", "06.00 - 21.30", "08.00 - 20.00"],
      "Mall Taman Anggrek": ["06.00 - 22.00", "06.00 - 21.30", "08.00 - 20.00"],
      "Pejaten Village": ["06.00 - 22.30", "06.00 - 21.30", "08.00 - 20.00"],
      "Lotte Mall Jakarta": ["06.00 - 22.00", "06.00 - 21.00", "08.00 - 20.00"],
      "Kemang Village": ["06.00 - 21.00", "06.00 - 21.00", "08.00 - 20.00"],
      "St. Moritz": ["06.00 - 22.00", "06.00 - 21.00", "08.00 - 20.00"],
      "Oakwood Mega Kuningan": ["06.00 - 22.00", "07.00 - 21.00", "Tutup"],
    };
    for (const [name, hours] of Object.entries(expected)) {
      const p = result.places.find(r => r.name === `Fitness First ${name}`); assert.ok(p, name);
      assert.equal(p.brand, "fitness_first"); assert.equal(p.area, "Jakarta"); assert.equal(p.dayPassAvailable, null);
      assert.deepEqual(p.openingHours, [
        { labelID: "Senin - Jumat", labelEN: "Monday - Friday", hours: hours[0] },
        { labelID: "Sabtu", labelEN: "Saturday", hours: hours[1] },
        { labelID: "Minggu / Libur Nasional", labelEN: "Sunday / Public Holidays", hours: hours[2] },
      ]);
      assert.ok(p.sources.some(s => s.kind === "operator") && p.sources.some(s => s.kind === "map"));
      assert.equal(new URL(p.googleMapsUrl).searchParams.get("query"), `${p.latitude},${p.longitude}`);
    }
    assert.equal(result.places.find(p => p.id === oakwood)!.isFavorite, true);
    assert.equal(result.places.find(p => p.id === oakwood)!.favoriteVersion, "7");
    const response = await GET(new Request("http://localhost/api/v1/catalog/places?brand=FITNESS_FIRST"));
    assert.equal(response.status, 200); const body = await response.json();
    assert.equal(body.total, 9); assert.ok(body.places.every((p: Record<string, unknown>) => !("isFavorite" in p)));
    const ids = new Set<string>(); let offset = 0;
    for (const expectedLength of [50, 50, 4]) {
      const page = await getPlaceCatalog(placesQuerySchema.parse({ offset: String(offset) }));
      assert.equal(page.total, 104); assert.equal(page.places.length, expectedLength);
      for (const p of page.places) { assert.ok(!ids.has(p.id)); ids.add(p.id); }
      offset = page.nextOffset ?? -1;
    }
    assert.equal(offset, -1); assert.equal(ids.size, 104);
    for (const statement of migrations[index].sql) await local.exec(statement);
    assert.equal((await getPlaceCatalog(placesQuerySchema.parse({ brand: "fitness_first" }))).total, 9);
  } finally {
    globals.musmoveDatabase = previousDb; globals.musmovePool = previousPool;
    process.env = env; await local.close();
  }
});
