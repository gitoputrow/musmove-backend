import assert from "node:assert/strict";
import test from "node:test";
import { distanceKm, parsePlacesQuery, placesQuerySchema } from "../../src/modules/places/query";

test("place query defaults and explicit booleans", () => {
  assert.deepEqual(placesQuerySchema.parse({}), { limit: 50, offset: 0 });
  assert.equal(placesQuerySchema.parse({ dayPassAvailable: "false" }).dayPassAvailable, false);
  assert.equal(placesQuerySchema.parse({ dayPassAvailable: "true" }).dayPassAvailable, true);
  assert.throws(() => placesQuerySchema.parse({ dayPassAvailable: "1" }));
});

test("place query supports each category, access model and origin", () => {
  const query = parsePlacesQuery("https://example.com/api/v1/catalog/places?mode=gym&gymCategory=conventional&dayPassAvailable=true&area=Jakarta&latitude=-6.2&longitude=106.8&radiusKm=5&limit=2&offset=1");
  assert.equal(query.latitude, -6.2);
  assert.equal(query.longitude, 106.8);
  assert.equal(query.radiusKm, 5);
  assert.equal(query.limit, 2);
  assert.equal(query.offset, 1);
  for (const accessModel of ["membership", "per_visit", "membership_or_per_visit", "public", "unknown"]) {
    assert.equal(placesQuerySchema.parse({ accessModel }).accessModel, accessModel);
  }
});

test("place query requires both origin coordinates and origin for radius", () => {
  for (const query of [{ latitude: "-6.2" }, { longitude: "106.8" }, { radiusKm: "5" }]) {
    assert.throws(() => placesQuerySchema.parse(query));
  }
});

test("place query rejects malformed, non-finite or out-of-range coordinates", () => {
  for (const latitude of ["", " ", "NaN", "Infinity", "91", "-91", "1e2", "0x1", "-6.2x"]) {
    assert.throws(() => placesQuerySchema.parse({ latitude, longitude: "106.8" }));
  }
  for (const longitude of ["", "181", "-181", "Infinity"]) {
    assert.throws(() => placesQuerySchema.parse({ latitude: "-6.2", longitude }));
  }
});

test("place query rejects conflicting filters, unknown keys and duplicates", () => {
  assert.throws(() => placesQuerySchema.parse({ mode: "calisthenics", gymCategory: "brand" }));
  assert.throws(() => placesQuerySchema.parse({ mode: "calisthenics", brand: "ftl" }));
  assert.throws(() => placesQuerySchema.parse({ gymCategory: "other" }));
  assert.throws(() => parsePlacesQuery("https://example.com?limit=1&limit=2"));
  assert.throws(() => parsePlacesQuery("https://example.com?__proto__=bad"));
  assert.throws(() => parsePlacesQuery("https://example.com?favoritesOnly=true"));
});

test("place query bounds radius and pagination", () => {
  for (const limit of ["0", "101", "1.5", "Infinity", ""]) assert.throws(() => placesQuerySchema.parse({ limit }));
  for (const offset of ["-1", "100001", "1.1"]) assert.throws(() => placesQuerySchema.parse({ offset }));
  for (const radiusKm of ["0", "-1", "101"]) {
    assert.throws(() => placesQuerySchema.parse({ latitude: "-6.2", longitude: "106.8", radiusKm }));
  }
});

test("great-circle distance is symmetric, finite and zero at the same point", () => {
  assert.equal(distanceKm(-6.226542, 106.8546583, -6.226542, 106.8546583), 0);
  const a = distanceKm(-6.226542, 106.8546583, -6.2372018, 106.8528973);
  const b = distanceKm(-6.2372018, 106.8528973, -6.226542, 106.8546583);
  assert.equal(a, b);
  assert.ok(a > 1 && a < 1.3);
  assert.ok(Math.abs(distanceKm(0, 0, 0, 1) - 111.195) < 0.01);
  assert.ok(Number.isFinite(distanceKm(0, 0, 0, 180)));
});
