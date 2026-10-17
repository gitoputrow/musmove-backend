import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { loadEnvConfig } from "@next/env";

// Deliberately imported only by migration tooling, never by API/runtime modules.
export function loadMigrationEnvironment() {
  loadEnvConfig(process.cwd());
  const path = resolve(process.cwd(), ".env.migrations.local");
  if (!process.env.DATABASE_URL_DIRECT && process.env.VERCEL !== "1" && existsSync(path)) {
    const values = parseEnv(readFileSync(path, "utf8"));
    if (values.DATABASE_URL_DIRECT) process.env.DATABASE_URL_DIRECT = values.DATABASE_URL_DIRECT;
  }
}
