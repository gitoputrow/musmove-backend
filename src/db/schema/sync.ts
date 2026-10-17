import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { syncOperationEnum } from "./enums";
import { createdAt } from "./helpers";
import type { JsonObject, JsonValue } from "./types";
import { users } from "./users";

export const syncState = pgTable(
  "sync_state",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    nextSequence: bigint("next_sequence", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    epoch: uuid("epoch").notNull().defaultRandom(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("sync_state_next_sequence_positive", sql`${table.nextSequence} > 0`),
  ],
);

export const syncChanges = pgTable(
  "sync_changes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sequence: bigint("sequence", { mode: "bigint" }).notNull(),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: varchar("entity_id", { length: 255 }).notNull(),
    entityVersion: bigint("entity_version", { mode: "bigint" }).notNull(),
    operation: syncOperationEnum("operation").notNull(),
    payload: jsonb("payload").$type<JsonValue>(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.sequence] }),
    index("sync_changes_user_entity_idx").on(
      table.userId,
      table.entityType,
      table.entityId,
    ),
    check("sync_changes_sequence_positive", sql`${table.sequence} > 0`),
    check("sync_changes_version_positive", sql`${table.entityVersion} > 0`),
    check("sync_changes_entity_type_not_blank", sql`length(trim(${table.entityType})) > 0`),
    check("sync_changes_entity_id_not_blank", sql`length(trim(${table.entityId})) > 0`),
    check(
      "sync_changes_upsert_payload",
      sql`${table.operation} = 'delete' or ${table.payload} is not null`,
    ),
  ],
);

export const operationReceipts = pgTable(
  "operation_receipts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    operationId: uuid("operation_id").notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    result: jsonb("result").$type<JsonObject>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.operationId] }),
    check(
      "operation_receipts_hash_format",
      sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const demoImports = pgTable(
  "demo_imports",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    importId: uuid("import_id").notNull(),
    snapshotHash: varchar("snapshot_hash", { length: 64 }).notNull(),
    idMapping: jsonb("id_mapping")
      .$type<JsonObject>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    receipt: jsonb("receipt").$type<JsonObject>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.importId] }),
    check(
      "demo_imports_hash_format",
      sql`${table.snapshotHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export type SyncState = typeof syncState.$inferSelect;
export type SyncChange = typeof syncChanges.$inferSelect;
export type OperationReceipt = typeof operationReceipts.$inferSelect;
