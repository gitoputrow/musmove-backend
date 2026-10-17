import { loadMigrationEnvironment } from "./src/db/migration-env";

loadMigrationEnvironment();

const databaseUrl =
  process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? "";

export default {
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
  migrations: {
    schema: "drizzle",
    table: "migrations",
  },
  strict: true,
  verbose: true,
} as const;
