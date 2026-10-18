import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { loadMigrationEnvironment } from "../src/db/migration-env";

export function loadOperationsEnvironment() {
  if (process.env.VERCEL === "1") throw new Error("Run operational tooling outside the public Vercel runtime");
  loadMigrationEnvironment();
  if (!process.env.DATABASE_URL_DIRECT) throw new Error("Separate administrative migration connection required");
  process.env.DATABASE_URL = process.env.DATABASE_URL_DIRECT;
  if (existsSync(".env.operations.local")) {
    const env = parseEnv(readFileSync(".env.operations.local", "utf8"));
    for (const key of ["NEON_AUTH_ADMIN_COOKIE", "MUSMOVE_API_BASE_URL"]) if (!process.env[key] && env[key]) process.env[key] = env[key];
  }
}
