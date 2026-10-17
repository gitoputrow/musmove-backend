import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const equipmentCatalog = pgTable("equipment_catalog", {
  id: varchar("id", { length: 80 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  aliases: text("aliases").array().notNull(),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("equipment_catalog_id", sql`${table.id} ~ '^[a-z][a-z0-9_]{0,79}$'`),
  check("equipment_catalog_name", sql`length(trim(${table.name})) > 0`),
  check("equipment_catalog_aliases", sql`cardinality(${table.aliases}) > 0 and array_ndims(${table.aliases}) = 1 and array_position(${table.aliases}, NULL) is null and not (${table.aliases} @> ARRAY['']::text[])`),
]);
