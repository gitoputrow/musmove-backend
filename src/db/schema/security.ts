import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// Ephemeral HMAC buckets; never stores raw IPs, JWTs or account identifiers.
export const apiRateLimits = pgTable("api_rate_limits", {
  bucketKey: varchar("bucket_key", { length: 64 }).primaryKey(),
  requests: integer("requests").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
}, (table) => [
  check("api_rate_limits_key", sql`${table.bucketKey} ~ '^[0-9a-f]{64}$'`),
  check("api_rate_limits_requests", sql`${table.requests} > 0`),
  index("api_rate_limits_expiry_idx").on(table.resetAt),
]);
