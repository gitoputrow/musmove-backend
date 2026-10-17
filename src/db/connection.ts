interface DatabaseUrlOptions {
  direct?: boolean;
}

export function normalizeDatabaseUrl(
  connectionString: string,
  options: DatabaseUrlOptions = {},
) {
  const url = new URL(connectionString);

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("Database URL must use the postgres or postgresql protocol");
  }

  const isNeon = url.hostname.endsWith(".neon.tech");

  if (options.direct && isNeon) {
    url.hostname = url.hostname.replace("-pooler.", ".");
  }

  if (isNeon && url.searchParams.get("sslmode") === "require") {
    url.searchParams.set("sslmode", "verify-full");
  }

  return url.toString();
}
