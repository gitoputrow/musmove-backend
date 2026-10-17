import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const python = resolve("services/equipment-vision/.venv/bin/python");
if (!existsSync(python)) {
  console.error("Set up services/equipment-vision/.venv first; see docs/equipment-scan.md");
  process.exit(1);
}
const configuredToken = process.env.EQUIPMENT_VISION_TOKEN;
const token = configuredToken && !configuredToken.startsWith("replace-") ? configuredToken : randomBytes(32).toString("hex");
const env = { ...process.env, EQUIPMENT_VISION_TOKEN: token, EQUIPMENT_VISION_URL: "http://127.0.0.1:8100" };
// Do not expose Neon/Auth credentials to the separate inference process.
const visionEnv = Object.fromEntries(Object.entries(env).filter(([key]) =>
  ["PATH", "LANG", "LC_ALL", "TMPDIR", "SYSTEMROOT", "SSL_CERT_FILE", "SSL_CERT_DIR", "HF_HUB_OFFLINE"].includes(key)
  || key.startsWith("EQUIPMENT_VISION_")));
const children = [
  spawn(python, ["-m", "uvicorn", "main:app", "--app-dir", resolve("services/equipment-vision"), "--host", "127.0.0.1", "--port", "8100", "--no-access-log"], { env: visionEnv, stdio: "inherit" }),
  spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", ...process.argv.slice(2)], { env, stdio: "inherit" }),
];
console.info("Next.js + private SigLIP 2 service starting. Shared token stays in process memory, not in files or logs.");
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true; process.exitCode = code;
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  const timer = setTimeout(() => {
    for (const child of children) if (child.exitCode === null) child.kill("SIGKILL");
  }, 8000);
  timer.unref();
}
for (const child of children) {
  child.on("error", (error) => { console.error(error.message); stop(1); });
  child.on("exit", (code) => stop(code ?? 1));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
