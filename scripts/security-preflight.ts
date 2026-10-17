import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import { normalizeDatabaseUrl } from "../src/db/connection";
import { productionConfigurationIssues } from "../src/lib/security/config";

loadEnvConfig(process.cwd());

async function main() {
  const issues = productionConfigurationIssues();
  if (process.env.DATABASE_URL_DIRECT) issues.push("DATABASE_URL_DIRECT: remove migration credentials from the deployment runtime");
  if (process.env.VERCEL === "1" && Number(process.versions.node.split(".")[0]) !== 24) issues.push("Node.js: select supported 24.x runtime");
  if (process.env.DATABASE_URL && !issues.some((issue) => issue.startsWith("DATABASE_URL:"))) {
    const pool = new Pool({ connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL), max: 1,
      connectionTimeoutMillis: 5000, statement_timeout: 5000, allowExitOnIdle: true });
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN READ ONLY");
        const roles = (await client.query(`SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls FROM pg_roles WHERE rolname IN (current_user, session_user)`)).rows;
        const membership = (await client.query(`SELECT EXISTS (
          SELECT 1 FROM pg_roles WHERE (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls OR rolname IN
          ('neon_superuser','pg_read_all_data','pg_write_all_data','pg_execute_server_program','pg_read_server_files','pg_write_server_files'))
          AND (pg_has_role(current_user, oid, 'MEMBER') OR pg_has_role(session_user, oid, 'MEMBER'))
        ) AS privileged`)).rows[0];
        if (!roles.length || roles.some((role) => role.rolsuper || role.rolcreaterole || role.rolcreatedb || role.rolbypassrls) || membership.privileged) issues.push("DATABASE_ROLE: privileged roles/memberships must not run the API");
        const ownership = (await client.query(`SELECT EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND
          (pg_has_role(current_user, c.relowner, 'MEMBER') OR pg_has_role(session_user, c.relowner, 'MEMBER'))
        ) AS owns_tables, (has_schema_privilege(current_user, 'public', 'CREATE') OR has_schema_privilege(session_user, 'public', 'CREATE')) AS can_create,
        to_regclass('public.api_rate_limits') IS NOT NULL AS rate_table`)).rows[0];
        if (ownership.owns_tables || ownership.can_create) issues.push("DATABASE_ROLE: use a non-owner role without CREATE on public; see runtime-role-grants.sql");
        if (!ownership.rate_table) issues.push("DATABASE_MIGRATIONS: apply migration 0015 before deploying");
        for (const table of ["meal_catalog", "exercise_catalog", "equipment_catalog", "place_catalog", "workout_program_catalog", "workout_program_exercises", "catalog_state"]) {
          const permission = (await client.query("SELECT has_table_privilege(current_user, $1, 'SELECT') AS can_read, has_table_privilege(current_user, $1, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS can_write", [table])).rows[0];
          if (!permission.can_read || permission.can_write) issues.push(`DATABASE_ROLE: ${table} must be read-only for the API`);
        }
        const required = (await client.query(`SELECT bool_and(has_table_privilege(current_user, tables.name, permissions.name)) AS ready
          FROM unnest(ARRAY['users','profiles','training_preferences','custom_programs','user_exercises','workout_sessions','user_preferences',
          'place_favorites','meal_entries','social_drafts','legacy_user_metadata','sync_state','sync_changes','operation_receipts','demo_imports',
          'nutrition_estimates','api_rate_limits']) tables(name)
          CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) permissions(name)`)).rows[0];
        if (!required.ready) issues.push("DATABASE_ROLE: required application table grants are incomplete");
        await client.query("ROLLBACK");
      } finally { client.release(); }
    } catch {
      issues.push("DATABASE_ACCESS: read-only security inspection failed; check connectivity, migrations and role grants");
    } finally { await pool.end(); }
  }
  if (issues.length) {
    console.error("Deployment security preflight: NOT READY (no secret values printed)");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  } else console.info("Deployment security preflight passed: configuration, verified DB TLS, limited role and migrations. Still configure Vercel WAF/preview protection and run a deployed smoke test.");
}
void main().catch(() => { console.error("Security preflight failed; no credentials or database errors were logged"); process.exitCode = 1; });
