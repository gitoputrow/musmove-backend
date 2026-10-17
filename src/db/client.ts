import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { normalizeDatabaseUrl } from "./connection";
import * as schema from "./schema";

const globalDatabase = globalThis as typeof globalThis & {
  musmovePool?: Pool;
  musmoveDatabase?: ReturnType<typeof createDatabase>;
};

function positiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 20) {
    throw new Error("DATABASE_POOL_MAX must be an integer from 1 to 20");
  }

  return parsed;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to access the database");
  }

  return new Pool({
    connectionString: normalizeDatabaseUrl(connectionString),
    max: positiveInteger(process.env.DATABASE_POOL_MAX, 5),
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 10000,
    lock_timeout: 3000,
    idle_in_transaction_session_timeout: 10000,
    allowExitOnIdle: true,
  });
}

function createDatabase(pool: Pool) {
  return drizzle(pool, { schema });
}

export function getPool() {
  if (!globalDatabase.musmovePool) {
    globalDatabase.musmovePool = createPool();
  }

  return globalDatabase.musmovePool;
}

export function getDatabase() {
  if (!globalDatabase.musmoveDatabase) {
    globalDatabase.musmoveDatabase = createDatabase(getPool());
  }

  return globalDatabase.musmoveDatabase;
}

export type Database = ReturnType<typeof createDatabase>;
