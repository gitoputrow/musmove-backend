import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { accountStatusEnum } from "./enums";
import { createdAt } from "./helpers";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issuer: varchar("issuer", { length: 255 }).notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    status: accountStatusEnum("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("users_issuer_subject_uidx").on(table.issuer, table.subject),
    check("users_issuer_not_blank", sql`length(trim(${table.issuer})) > 0`),
    check("users_subject_not_blank", sql`length(trim(${table.subject})) > 0`),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
