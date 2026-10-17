import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { normalizeDatabaseUrl } from "./connection";
import { loadMigrationEnvironment } from "./migration-env";

loadMigrationEnvironment();

async function main() {
  const connectionString =
    process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL_DIRECT or DATABASE_URL is required");
  }

  const pool = new Pool({
    connectionString: normalizeDatabaseUrl(connectionString, { direct: true }),
    max: 1,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });

  try {
    await migrate(drizzle(pool), {
      migrationsFolder: "./drizzle",
      migrationsSchema: "drizzle",
      migrationsTable: "migrations",
    });
    console.info("Database migrations completed");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown migration error";
  console.error(`Database migration failed: ${message}`);
  process.exitCode = 1;
});
