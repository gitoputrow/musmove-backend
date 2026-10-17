import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const loader = resolve("src/db/migration-env.ts");
const cli = resolve("node_modules/tsx/dist/cli.mjs");
const nextEnv = resolve("node_modules/@next/env");

test("Admin environment loads only for explicit local migration tooling", () => {
  const directory = mkdtempSync(join(tmpdir(), "musmove-migration-env-"));
  try {
    writeFileSync(join(directory, ".env"), "DATABASE_URL=runtime-fixture\n");
    writeFileSync(join(directory, ".env.migrations.local"), "DATABASE_URL_DIRECT=admin-fixture\nDATABASE_URL=must-not-override-runtime\n", { mode: 0o600 });
    const run = (migration: boolean, overrides: Record<string, string> = {}) => {
      const env = { ...process.env };
      for (const key of ["DATABASE_URL", "DATABASE_URL_DIRECT", "VERCEL", "__NEXT_PROCESSED_ENV", "NODE_ENV"]) delete env[key];
      Object.assign(env, { NODE_ENV: "test", ...overrides });
      const code = migration
        ? `require(${JSON.stringify(loader)}).loadMigrationEnvironment();`
        : `require(${JSON.stringify(nextEnv)}).loadEnvConfig(process.cwd());`;
      const result = spawnSync(process.execPath, [cli, "--eval", code + "console.log(JSON.stringify({runtime:process.env.DATABASE_URL,direct:process.env.DATABASE_URL_DIRECT??null}));"], {
        cwd: directory, env, encoding: "utf8", timeout: 15000,
      });
      assert.equal(result.status, 0, "Isolated environment loader must succeed");
      return JSON.parse(result.stdout.trim());
    };
    assert.deepEqual(run(false), { runtime: "runtime-fixture", direct: null });
    assert.deepEqual(run(true), { runtime: "runtime-fixture", direct: "admin-fixture" });
    assert.deepEqual(run(true, { VERCEL: "1" }), { runtime: "runtime-fixture", direct: null });
    assert.deepEqual(run(true, { DATABASE_URL_DIRECT: "ci-fixture" }), { runtime: "runtime-fixture", direct: "ci-fixture" });
  } finally {
    rmSync(directory, { recursive: true });
  }
});
