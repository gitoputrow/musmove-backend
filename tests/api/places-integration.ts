import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { inArray, sql } from "drizzle-orm";
import { distanceKm, placesQuerySchema } from "../../src/modules/places/query";

loadEnvConfig(process.cwd());
process.env.SYNC_CURSOR_SECRET = "places-integration-test-secret-32-characters";

async function main() {
  const { getDatabase, getPool } = await import("../../src/db/client");
  const { users, syncState } = await import("../../src/db/schema");
  const { getPlaceCatalog } = await import("../../src/modules/places/service");
  const { pushOperations } = await import("../../src/modules/sync/service");
  const { syncPushSchema } = await import("../../src/modules/sync/dto");
  const publicRoute = await import("../../app/api/v1/catalog/places/route");
  const privateRoute = await import("../../app/api/v1/places/route");
  const db = getDatabase();
  const ids: string[] = [];
  const query = (value: Record<string, string> = {}) => placesQuerySchema.parse(value);
  async function createUser() {
    const [user] = await db.insert(users).values({ issuer: `test://places/${randomUUID()}`, subject: randomUUID() }).returning();
    ids.push(user.id);
    await db.insert(syncState).values({ userId: user.id });
    return user.id;
  }
  async function favorite(userId: string, placeId: string, action: "upsert" | "delete", baseVersion: string) {
    return pushOperations(userId, syncPushSchema.parse({
      schemaVersion: 1, deviceId: "places-test", operations: [{
        entityType: "place_favorite", entityId: placeId, operationId: randomUUID(),
        action, baseVersion, ...(action === "upsert" ? { payload: {} } : {}),
      }],
    }));
  }

  try {
    const removedColumns = await db.execute(sql`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'place_catalog'
      and column_name in ('access_evidence', 'access_note', 'location_note', 'equipment', 'coordinate_scope')
    `);
    assert.equal(removedColumns.rows.length, 0, "Removed place columns must not exist in Neon");
    const catalog = await getPlaceCatalog(query());
    assert.equal(catalog.total, 18);
    assert.equal(catalog.places.length, 18);
    assert.equal(catalog.distanceType, null);
    assert.ok(catalog.places.every((p) => p.distanceKm === null && !("isFavorite" in p)));
    assert.ok(catalog.places.every((p) => p.area === "Jakarta" && p.checkedAt === "2026-10-11" && p.sources.length > 0));
    for (const p of catalog.places) {
      for (const field of ["accessEvidence", "accessNote", "locationNote", "equipment", "coordinateScope"]) {
        assert.ok(!(field in p), `Removed field ${field} must not appear in the API`);
      }
      assert.ok(p.sources.every((source) => source.fields.length > 0 && !source.fields.some((field: string) => field === "equipment")));
      assert.ok(p.latitude >= -6.4 && p.latitude <= -6 && p.longitude >= 106.6 && p.longitude <= 107);
      const maps = new URL(p.googleMapsUrl);
      assert.equal(maps.host, "www.google.com");
      assert.equal(maps.searchParams.get("api"), "1");
      assert.equal(maps.searchParams.get("query"), `${p.latitude},${p.longitude}`);
    }
    assert.equal((await getPlaceCatalog(query({ mode: "gym", gymCategory: "brand" }))).total, 13);
    const locals = await getPlaceCatalog(query({ gymCategory: "conventional", dayPassAvailable: "true" }));
    assert.equal(locals.total, 2);
    assert.ok(locals.places.every((p) => p.accessModel === "membership_or_per_visit" && p.sources.some((source) => source.kind === "publisher" && source.fields.includes("access"))));
    assert.equal((await getPlaceCatalog(query({ brand: "FITHub", area: "jakarta" }))).total, 10);
    assert.equal((await getPlaceCatalog(query({ brand: "ftl" }))).total, 3);
    assert.equal((await getPlaceCatalog(query({ mode: "calisthenics" }))).total, 3);
    assert.equal((await getPlaceCatalog(query({ city: "Jakarta Pusat" }))).total, 4);
    assert.equal((await getPlaceCatalog(query({ area: "Bandung" }))).total, 0);
    assert.equal((await getPlaceCatalog(query({ dayPassAvailable: "false" }))).total, 0); // null is not false
    assert.equal((await getPlaceCatalog(query({ accessModel: "membership" }))).total, 13);
    const page = await getPlaceCatalog(query({ limit: "2", offset: "1" }));
    assert.deepEqual(page.places.map((p) => p.id), catalog.places.slice(1, 3).map((p) => p.id));
    assert.equal(page.total, 18);
    assert.equal(page.hasMore, true);
    assert.equal(page.nextOffset, 3);
    const beyond = await getPlaceCatalog(query({ offset: "100" }));
    assert.equal(beyond.places.length, 0);
    assert.equal(beyond.hasMore, false);

    const origin = { latitude: "-6.226542", longitude: "106.8546583" };
    const near = await getPlaceCatalog(query(origin));
    assert.equal(near.places[0].id, "jakarta-ftl-tebet");
    assert.equal(near.places[0].distanceKm, 0);
    assert.equal(near.distanceType, "straight_line");
    for (let i = 0; i < near.places.length; i++) {
      const p = near.places[i];
      const expected = Math.round(distanceKm(Number(origin.latitude), Number(origin.longitude), p.latitude, p.longitude) * 1000) / 1000;
      assert.equal(p.distanceKm, expected);
      if (i > 0) assert.ok(p.distanceKm! >= near.places[i - 1].distanceKm!);
    }
    const within = await getPlaceCatalog(query({ ...origin, radiusKm: "2", limit: "1" }));
    assert.equal(within.total, catalog.places.filter((p) => distanceKm(Number(origin.latitude), Number(origin.longitude), p.latitude, p.longitude) <= 2).length);
    assert.equal(within.places.length, 1);
    assert.equal(within.hasMore, true);

    const user = await createUser(), other = await createUser();
    assert.equal((await favorite(user, "jakarta-ftl-tebet", "upsert", "0")).results[0].status, "applied");
    assert.equal((await favorite(user, "Jakarta-0", "upsert", "0")).results[0].status, "applied"); // preserve old mobile IDs
    const own = await getPlaceCatalog(query(), user);
    const others = await getPlaceCatalog(query(), other);
    assert.equal(own.places.filter((p) => "isFavorite" in p && p.isFavorite).length, 1);
    assert.equal(others.places.filter((p) => "isFavorite" in p && p.isFavorite).length, 0);
    assert.equal((await favorite(user, "jakarta-ftl-tebet", "delete", "1")).results[0].status, "applied");
    assert.equal((await getPlaceCatalog(query(), user)).places.filter((p) => "isFavorite" in p && p.isFavorite).length, 0);

    const response = await publicRoute.GET(new Request("http://localhost/api/v1/catalog/places?mode=calisthenics"));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).total, 3);
    assert.ok(response.headers.get("cache-control")?.includes("no-store"));
    assert.ok(response.headers.get("x-request-id"));
    const invalid = await publicRoute.GET(new Request("http://localhost/api/v1/catalog/places?latitude=91&longitude=106.8"));
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, "VALIDATION_ERROR");
    assert.equal((await privateRoute.GET(new Request("http://localhost/api/v1/places"))).status, 401);
    assert.equal((await publicRoute.OPTIONS(new Request("http://localhost/api/v1/catalog/places", { method: "OPTIONS" }))).status, 204);
    console.info("Places integration passed: 18 persisted places, filters, distances, pagination, isolated favorites and routes");
  } finally {
    if (ids.length) await db.delete(users).where(inArray(users.id, ids));
    await getPool().end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
