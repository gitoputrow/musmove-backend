import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users";
import type { JsonValue } from "./types";

export const syncSnapshots = pgTable("sync_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  epoch: uuid("epoch").notNull(), sequence: bigint("sequence", { mode: "bigint" }).notNull(), total: integer("total").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, t => [index("sync_snapshots_user_expiry_idx").on(t.userId, t.expiresAt), check("sync_snapshots_budget", sql`${t.total} between 0 and 20000 and ${t.sequence} >= 0`)]);

export const syncSnapshotItems = pgTable("sync_snapshot_items", {
  snapshotId: uuid("snapshot_id").notNull().references(() => syncSnapshots.id, { onDelete: "cascade" }),
  position: integer("position").notNull(), entityType: varchar("entity_type", { length: 80 }).notNull(), entityId: varchar("entity_id", { length: 255 }).notNull(),
  version: bigint("version", { mode: "bigint" }).notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(), payload: jsonb("payload").$type<JsonValue>().notNull(),
}, t => [primaryKey({ columns: [t.snapshotId, t.position] }), check("sync_snapshot_item_position", sql`${t.position} > 0 and ${t.version} > 0`)]);

export const accountDeletionJobs = pgTable("account_deletion_jobs", {
  id: uuid("id").primaryKey().defaultRandom(), userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 30 }).notNull().default("waiting"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(), deleteAfter: timestamp("delete_after", { withTimezone: true }).notNull(),
  providerDeletedAt: timestamp("provider_deleted_at", { withTimezone: true }), completedAt: timestamp("completed_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0), lastErrorCode: varchar("last_error_code", { length: 80 }), retryAt: timestamp("retry_at", { withTimezone: true }),
}, t => [uniqueIndex("account_deletion_jobs_user_unique").on(t.userId), index("account_deletion_jobs_due_idx").on(t.deleteAfter, t.retryAt), check("account_deletion_job_status", sql`${t.status} in ('waiting','provider_pending','failed','completed') and ${t.attempts} >= 0`)]);

export const revokedIdentities = pgTable("revoked_identities", {
  identityHash: varchar("identity_hash", { length: 64 }).primaryKey(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, t => [index("revoked_identities_expiry_idx").on(t.expiresAt), check("revoked_identity_hash_format", sql`${t.identityHash} ~ '^[0-9a-f]{64}$'`)]);

export const socialPosts = pgTable("social_posts", {
  id: uuid("id").primaryKey(), userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  authorLabel: varchar("author_label", { length: 80 }).notNull(), body: text("body").notNull(), requestHash: varchar("request_hash", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), deletedAt: timestamp("deleted_at", { withTimezone: true }),
  moderationStatus: varchar("moderation_status", { length: 20 }).notNull().default("visible"),
}, t => [index("social_posts_feed_idx").on(t.createdAt, t.id), check("social_posts_content", sql`length(trim(${t.body})) between 1 and 2000 and length(trim(${t.authorLabel})) between 1 and 80`), check("social_posts_moderation", sql`${t.moderationStatus} in ('visible','hidden')`)]);

export const socialReports = pgTable("social_reports", {
  id: uuid("id").primaryKey().defaultRandom(), postId: uuid("post_id").notNull().references(() => socialPosts.id, { onDelete: "cascade" }),
  reporterId: uuid("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }), reason: varchar("reason", { length: 30 }).notNull(),
  details: text("details"), status: varchar("status", { length: 20 }).notNull().default("open"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolution: varchar("resolution", { length: 20 }), resolvedAt: timestamp("resolved_at", { withTimezone: true }), moderatorRef: varchar("moderator_ref", { length: 80 }),
}, t => [uniqueIndex("social_reports_post_reporter_unique").on(t.postId, t.reporterId), check("social_report_reason", sql`${t.reason} in ('spam','harassment','unsafe_content','privacy','other')`), check("social_report_status", sql`${t.status} in ('open','resolved')`), check("social_report_details", sql`${t.details} is null or length(${t.details}) <= 1000`)]);
