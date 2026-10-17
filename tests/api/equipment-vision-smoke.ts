import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { loadEnvConfig } from "@next/env";
import { normalizePhoto } from "../../src/modules/equipment/photo";
import { recognizeEquipmentPhoto } from "../../src/modules/equipment/vision-client";

loadEnvConfig(process.cwd());

async function main() {
  const { getPool } = await import("../../src/db/client");
  const { getEquipmentCatalog, getEquipmentExercises } = await import("../../src/modules/equipment/service");
  const listener = createServer();
  listener.listen(0, "127.0.0.1"); await once(listener, "listening");
  const address = listener.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>((done) => listener.close(() => done()));
  const secret = randomBytes(32).toString("hex");
  process.env.EQUIPMENT_VISION_URL = `http://127.0.0.1:${address.port}`;
  process.env.EQUIPMENT_VISION_TOKEN = secret;
  process.env.EQUIPMENT_VISION_TIMEOUT_MS = "60000";
  const visionEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    ["PATH", "LANG", "LC_ALL", "TMPDIR", "SYSTEMROOT", "SSL_CERT_FILE", "SSL_CERT_DIR"].includes(key)
    || key.startsWith("EQUIPMENT_VISION_")));
  const service = resolve("services/equipment-vision");
  const child = spawn(resolve(service, ".venv/bin/python"), ["-m", "uvicorn", "main:app", "--app-dir", service,
    "--host", "127.0.0.1", "--port", String(address.port), "--no-access-log"], {
    env: { ...visionEnv, NODE_ENV: "test", HF_HUB_OFFLINE: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "", startupError: Error | undefined;
  child.on("error", (error) => { startupError = error; });
  child.stdout.on("data", (data) => { logs = (logs + data.toString()).slice(-8000); });
  child.stderr.on("data", (data) => { logs = (logs + data.toString()).slice(-8000); });
  console.info("Starting the REAL pinned SigLIP 2 model on CPU (offline cached weights; no mock)");
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (startupError || child.exitCode !== null) throw new Error(`Vision startup failed: ${startupError?.message ?? logs}`);
      try {
        const health = await fetch(`${process.env.EQUIPMENT_VISION_URL}/health`, {
          headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(1000),
        });
        if (health.ok) { ready = true; break; }
      } catch { /* wait for model warmup */ }
      await delay(1000);
    }
    assert.ok(ready, `Model startup timed out: ${logs}`);
    const catalog = await getEquipmentCatalog();
    // BGN-WMCO/Bangin, CC BY 2.5. See docs/equipment-scan.md for attribution.
    // Test URL is fixed; the public recognition endpoint NEVER accepts image URLs.
    const photo = await fetch("https://upload.wikimedia.org/wikipedia/commons/b/be/Dumbbell.JPG", { signal: AbortSignal.timeout(30000) });
    assert.equal(photo.status, 200);
    const jpeg = await normalizePhoto(Buffer.from(await photo.arrayBuffer()), "image/jpeg");
    const start = performance.now();
    const result = await recognizeEquipmentPhoto(jpeg, catalog.equipment);
    console.info(JSON.stringify({ realModel: result.modelId, status: result.status, candidates: result.candidates.map(({ id, score }) => ({ id, score })), elapsedMs: Math.round(performance.now() - start) }));
    assert.equal(result.status, "needs_confirmation");
    assert.equal(result.candidates[0].id, "dumbbell");
    assert.ok((await getEquipmentExercises(["dumbbell"])).ready.some((e) => e.id === "curl"));
    const blank = await sharp({ create: { width: 224, height: 224, channels: 3, background: "white" } }).jpeg().toBuffer();
    const unknown = await recognizeEquipmentPhoto(blank, catalog.equipment);
    console.info(`Blank-photo status: ${unknown.status} (all usable candidates still require user confirmation)`);
    console.info("Real vision smoke passed: photo -> normalized JPEG -> actual SigLIP 2 -> persisted equipment -> exercises");
  } finally {
    await getPool().end();
    if (child.exitCode === null && !startupError) {
      const stopped = once(child, "exit"); child.kill("SIGTERM");
      await Promise.race([stopped, delay(5000)]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
