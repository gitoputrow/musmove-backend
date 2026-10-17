import { sql } from "drizzle-orm";
import { bigint, timestamp } from "drizzle-orm/pg-core";

export function mutableColumns() {
  return {
    version: bigint("version", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    updatedAt: timestamp("updated_at", {
      mode: "date",
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", {
      mode: "date",
      withTimezone: true,
    }),
  };
}

export const createdAt = () =>
  timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow();
