type Environment = Record<string, string | undefined>;

export function isProduction(env: Environment = process.env) {
  return env.NODE_ENV === "production" || env.VERCEL === "1";
}

export function isStrongSecret(value: string | undefined) {
  return !!value && value.length >= 32 && value.length <= 512
    && !/replace|changeme|example|test.secret/i.test(value)
    && new Set(value).size >= 10 && !/\s/.test(value)
    && !Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

// Kept separate so an incomplete auth rollout fails auth closed without taking
// existing JWT/data endpoints offline. Deployment preflight checks both sets.
export function authProxyConfigurationIssues(env: Environment = process.env): string[] {
  const issues: string[] = [];
  if (!isStrongSecret(env.AUTH_SECRET)) issues.push("AUTH_SECRET: strong independent secret required for native auth sessions");
  if (env.AUTH_SECRET && [env.SYNC_CURSOR_SECRET, env.API_RATE_LIMIT_SECRET].includes(env.AUTH_SECRET)) issues.push("AUTH_SECRET: must differ from sync and rate-limit secrets");
  try {
    const url = new URL(env.AUTH_PUBLIC_ORIGIN ?? "https://musmove-backend.vercel.app");
    if (url.protocol !== "https:" || url.username || url.password || url.toString() !== `${url.origin}/`) throw new Error();
  } catch { issues.push("AUTH_PUBLIC_ORIGIN: exact HTTPS application origin required"); }
  return issues;
}

export function productionConfigurationIssues(env: Environment = process.env): string[] {
  const issues: string[] = [];
  if (env.NEON_AUTH_ADMIN_COOKIE) issues.push("NEON_AUTH_ADMIN_COOKIE: operational admin sessions must not be present in the public runtime");
  for (const name of ["SYNC_CURSOR_SECRET", "API_RATE_LIMIT_SECRET"]) {
    if (!isStrongSecret(env[name])) issues.push(`${name}: use an independent random secret of at least 32 characters`);
  }
  if (env.SYNC_CURSOR_SECRET && env.SYNC_CURSOR_SECRET === env.API_RATE_LIMIT_SECRET) issues.push("API_RATE_LIMIT_SECRET: must differ from SYNC_CURSOR_SECRET");
  for (const name of Object.keys(env)) {
    if (/^NEXT_PUBLIC_.*(?:SECRET|TOKEN|DATABASE|PASSWORD|PRIVATE_KEY)/i.test(name)) issues.push(`${name}: secrets must never be public`);
  }
  try {
    const url = new URL(env.NEON_AUTH_BASE_URL ?? "");
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.origin.length > 255) throw new Error();
  } catch { issues.push("NEON_AUTH_BASE_URL: valid HTTPS Auth URL required"); }
  try {
    const url = new URL(env.DATABASE_URL ?? "");
    const neonRequire = url.hostname.endsWith(".neon.tech") && url.searchParams.get("sslmode") === "require";
    if (!["postgres:", "postgresql:"].includes(url.protocol) || (!neonRequire && url.searchParams.get("sslmode") !== "verify-full")
      || url.searchParams.has("ssl") || url.searchParams.has("sslaccept")) throw new Error();
  } catch { issues.push("DATABASE_URL: PostgreSQL with verified TLS required"); }
  if (env.APP_ORIGIN) {
    try {
      const url = new URL(env.APP_ORIGIN);
      if (url.protocol !== "https:" || url.origin !== env.APP_ORIGIN) throw new Error();
    } catch { issues.push("APP_ORIGIN: omit for native-only clients or use an exact HTTPS origin"); }
  }
  if (env.EQUIPMENT_VISION_URL || env.EQUIPMENT_VISION_TOKEN) {
    try {
      const url = new URL(env.EQUIPMENT_VISION_URL ?? "");
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/"
        || /^(localhost|127\.|\[?::1\]?)/i.test(url.hostname)) throw new Error();
    } catch { issues.push("EQUIPMENT_VISION_URL: use a private authenticated service reachable over HTTPS, not localhost"); }
    if (!isStrongSecret(env.EQUIPMENT_VISION_TOKEN) || !/^[A-Za-z0-9._~-]{32,256}$/.test(env.EQUIPMENT_VISION_TOKEN ?? "")) issues.push("EQUIPMENT_VISION_TOKEN: strong shared token required");
  }
  return issues;
}

export function assertProductionConfiguration() {
  if (isProduction() && productionConfigurationIssues().length) {
    // Intentionally no values or detailed configuration exposed to clients.
    throw new Error("Production security configuration is incomplete; run security:check");
  }
}
