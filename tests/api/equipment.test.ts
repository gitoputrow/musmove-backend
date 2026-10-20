import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import sharp from "sharp";
import { ApiError } from "../../src/lib/api-error";
import { matchEquipmentExercises, normalizeEquipmentName, searchEquipment, type EquipmentExercise } from "../../src/modules/equipment/matching";
import { equipmentExercisesSchema, equipmentQueryParams, equipmentSearchSchema } from "../../src/modules/equipment/query";
import { boundedRequestBytes, MAX_PHOTO_BYTES, normalizePhoto, readEquipmentPhoto } from "../../src/modules/equipment/photo";
import { recognizeEquipmentPhoto, validateVisionReply, VISION_MODEL_ID, VISION_MODEL_REVISION, visionConfiguration } from "../../src/modules/equipment/vision-client";
import { withEquipmentScanLimit } from "../../src/modules/equipment/scan-limit";

const catalog = [
  { id: "dumbbell", name: "Dumbbell", aliases: ["dumbell", "halter", "dambel"] },
  { id: "barbell", name: "Barbell", aliases: ["barbel"] },
  { id: "pull_up_bar", name: "Pull-Up Bar", aliases: ["palang", "bar tarik"] },
];
const exercise = (id: string, requirements: string[][]): EquipmentExercise => ({ id, mode: "gym", idLabel: id, enLabel: id, defaultSets: 3, defaultReps: 10, requirements });
const reply = { modelId: VISION_MODEL_ID, modelRevision: VISION_MODEL_REVISION, status: "needs_confirmation", candidates: [{ equipmentId: "dumbbell", score: 0.8 }] };

test("equipment names use canonical IDs, normalized aliases and explicit ambiguity", () => {
  assert.equal(normalizeEquipmentName("  PULL_UP-BAR  "), "pull up bar");
  assert.equal(searchEquipment(catalog, "ＤＡＭＢＥＬ").equipment[0].id, "dumbbell");
  assert.equal(searchEquipment(catalog, "barbel").matchType, "exact");
  assert.equal(searchEquipment(catalog, "bar").matchType, "candidates");
  assert.equal(searchEquipment(catalog, "bar").equipment.length, 2);
  assert.equal(searchEquipment(catalog, "unknown machine").matchType, "no_match");
  assert.equal(searchEquipment(catalog, "__").matchType, "no_match");
  assert.equal(searchEquipment(catalog).equipment.length, 3);
});

test("equipment query validation rejects duplicates, arbitrary keys and invalid IDs", () => {
  assert.deepEqual(equipmentExercisesSchema.parse({ equipmentIds: "dumbbell,bench" }).equipmentIds, ["dumbbell", "bench"]);
  for (const equipmentIds of ["", "dumbbell,dumbbell", "dumbbell, bench", "Dumbbell", "../secret"]) assert.throws(() => equipmentExercisesSchema.parse({ equipmentIds }));
  assert.throws(() => equipmentSearchSchema.parse({ q: "a" }));
  assert.throws(() => equipmentSearchSchema.parse({ q: "test", userId: "spoof" }));
  assert.equal(equipmentSearchSchema.parse({ mode: "gym" }).mode, "gym");
  assert.equal(equipmentSearchSchema.parse({ q: "bar", mode: "calisthenics" }).mode, "calisthenics");
  assert.throws(() => equipmentSearchSchema.parse({ mode: "both" }));
  assert.throws(() => equipmentQueryParams("http://localhost?mode=gym&mode=calisthenics"));
  assert.throws(() => equipmentQueryParams("http://localhost?q=a&q=b"));
  assert.throws(() => equipmentSearchSchema.parse(equipmentQueryParams("http://localhost?__proto__=x")));
});

test("exercise matching preserves AND groups and alternative combinations", () => {
  const exercises = [exercise("curl", [["dumbbell"]]), exercise("bench", [["dumbbell", "bench"]]),
    exercise("alternative", [["dumbbell", "bench"], ["barbell", "bench"]]), exercise("bodyweight", [[]])];
  const result = matchEquipmentExercises(exercises, ["dumbbell"]);
  assert.deepEqual(result.ready.map((r) => r.id), ["curl"]);
  assert.deepEqual(result.needsMoreEquipment.find((r) => r.id === "bench")?.missingEquipmentOptions, [["bench"]]);
  assert.deepEqual(result.needsMoreEquipment.find((r) => r.id === "alternative")?.missingEquipmentOptions, [["bench"]]);
  assert.ok(!result.ready.some((r) => r.id === "bodyweight"));
  assert.equal(matchEquipmentExercises(exercises, ["dumbbell", "bench"]).ready.length, 3);
  assert.equal(matchEquipmentExercises(exercises, ["mat"]).ready.length, 0);
});

test("photos are resized, rotated, normalized and stripped of metadata", async () => {
  const original = await sharp({ create: { width: 1600, height: 800, channels: 3, background: "red" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const output = await normalizePhoto(original, "image/jpeg");
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.ok(metadata.width! <= 1024 && metadata.height! <= 1024);
  assert.ok(metadata.height! > metadata.width!);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.orientation, undefined);
});

test("photo validation rejects malformed, spoofed, unsupported and oversized inputs", async () => {
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(normalizePhoto(png, "image/jpeg"), (e: unknown) => e instanceof ApiError && e.status === 415);
  await assert.rejects(normalizePhoto(Buffer.from("not an image"), "image/png"));
  await assert.rejects(normalizePhoto(Buffer.from("<svg/>"), "image/svg+xml"));
  await assert.rejects(normalizePhoto(Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"/>"), "image/png"));
  await assert.rejects(normalizePhoto(Buffer.alloc(0), "image/jpeg"));
  await assert.rejects(normalizePhoto(Buffer.alloc(MAX_PHOTO_BYTES + 1), "image/jpeg"));
  const large = await sharp({ create: { width: 4097, height: 4096, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(normalizePhoto(large, "image/png"));
});

test("multipart uploads accept only one bounded photo file", async () => {
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "white" } }).png().toBuffer();
  const form = new FormData();
  form.set("photo", new Blob([new Uint8Array(png)], { type: "image/png" }), "photo.png");
  const result = await readEquipmentPhoto(new Request("http://localhost", { method: "POST", body: form }));
  assert.equal((await sharp(result).metadata()).format, "jpeg");
  form.append("photo", "bad");
  await assert.rejects(readEquipmentPhoto(new Request("http://localhost", { method: "POST", body: form })));
  form.delete("photo"); form.set("photo", "https://example.com/image.jpg");
  await assert.rejects(readEquipmentPhoto(new Request("http://localhost", { method: "POST", body: form })));
  await assert.rejects(readEquipmentPhoto(new Request("http://localhost", { method: "POST", body: "{}", headers: { "content-type": "application/json" } })));
});

test("request size is counted on the stream, not trusted from Content-Length", async () => {
  await assert.rejects(boundedRequestBytes(new Request("http://localhost", { method: "POST", body: "12345" }), 4));
  await assert.rejects(boundedRequestBytes(new Request("http://localhost", { method: "POST", body: "1", headers: { "content-length": "99" } }), 4));
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5)); controller.close(); } });
  await assert.rejects(boundedRequestBytes(new Request("http://localhost", { method: "POST", body: stream, duplex: "half" } as RequestInit), 4));
  const badCancel = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5)); }, cancel() { throw new Error("cancel failed"); } });
  await assert.rejects(boundedRequestBytes(new Request("http://localhost", { method: "POST", body: badCancel, duplex: "half" } as RequestInit), 4), (e: unknown) => e instanceof ApiError && e.status === 413);
});

test("vision results must use valid catalog IDs, pinned model and finite scores", () => {
  assert.equal(validateVisionReply(reply, catalog).candidates[0].name, "Dumbbell");
  assert.equal(validateVisionReply({ ...reply, status: "unknown", candidates: [] }, catalog).status, "unknown");
  for (const value of [
    { ...reply, modelId: "other" }, { ...reply, modelRevision: "main" },
    { ...reply, candidates: [{ equipmentId: "invented", score: 0.8 }] },
    { ...reply, candidates: [{ equipmentId: "dumbbell", score: NaN }] },
    { ...reply, candidates: [...reply.candidates, ...reply.candidates] },
    { ...reply, candidates: [] }, { ...reply, status: "unknown" },
  ]) assert.throws(() => validateVisionReply(value, catalog));
});

test("private vision HTTP transport and error handling", async () => {
  const previous = { url: process.env.EQUIPMENT_VISION_URL, token: process.env.EQUIPMENT_VISION_TOKEN, timeout: process.env.EQUIPMENT_VISION_TIMEOUT_MS };
  let responseCode = 200, responseBody = JSON.stringify(reply);
  const secret = randomUUID().replaceAll("-", "");
  const server = createServer(async (request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${secret}`);
    let body = ""; for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    assert.equal(payload.candidates[0].id, "dumbbell");
    assert.equal(typeof payload.imageBase64, "string");
    response.writeHead(responseCode, { "content-type": "application/json", location: "http://127.0.0.1:1" });
    response.end(responseBody);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  process.env.EQUIPMENT_VISION_URL = `http://127.0.0.1:${address.port}`;
  process.env.EQUIPMENT_VISION_TOKEN = secret;
  try {
    assert.equal((await recognizeEquipmentPhoto(Buffer.from("test jpeg"), catalog)).candidates[0].id, "dumbbell");
    for (const status of [429, 500, 302]) {
      responseCode = status;
      await assert.rejects(recognizeEquipmentPhoto(Buffer.from("test"), catalog), (e: unknown) => e instanceof ApiError && e.status === (status === 429 ? 429 : 503));
    }
    responseCode = 200; responseBody = "invalid JSON";
    await assert.rejects(recognizeEquipmentPhoto(Buffer.from("test"), catalog), (e: unknown) => e instanceof ApiError && e.status === 502);
    responseBody = "x".repeat(65537);
    await assert.rejects(recognizeEquipmentPhoto(Buffer.from("test"), catalog), (e: unknown) => e instanceof ApiError && e.status === 502);
    process.env.EQUIPMENT_VISION_URL = "file:///etc/passwd";
    assert.throws(visionConfiguration);
    process.env.EQUIPMENT_VISION_TOKEN = "";
    assert.throws(visionConfiguration);
  } finally {
    for (const [key, value] of Object.entries({ EQUIPMENT_VISION_URL: previous.url, EQUIPMENT_VISION_TOKEN: previous.token, EQUIPMENT_VISION_TIMEOUT_MS: previous.timeout })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("photo scan limits enforce per-user budget and release concurrency slots", async () => {
  const id = randomUUID();
  for (let i = 0; i < 5; i++) await withEquipmentScanLimit(id, async () => 1);
  await assert.rejects(withEquipmentScanLimit(id, async () => 1), (e: unknown) => e instanceof ApiError && e.status === 429);
  let first!: () => void, second!: () => void;
  const a = withEquipmentScanLimit(randomUUID(), () => new Promise<void>((resolve) => { first = resolve; }));
  const b = withEquipmentScanLimit(randomUUID(), () => new Promise<void>((resolve) => { second = resolve; }));
  await assert.rejects(withEquipmentScanLimit(randomUUID(), async () => 1));
  first(); second(); await Promise.all([a, b]);
  await assert.rejects(withEquipmentScanLimit(randomUUID(), async () => { throw new Error("test failure"); }));
  assert.equal(await withEquipmentScanLimit(randomUUID(), async () => 2), 2);
});
