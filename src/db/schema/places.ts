import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, index, jsonb, numeric, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { trainingModeEnum } from "./enums";

export type PlaceAccessModel = "membership" | "per_visit" | "membership_or_per_visit" | "public" | "unknown";
export interface PlaceSource {
  url: string;
  kind: "operator" | "publisher" | "map" | "community";
  fields: ("identity" | "location" | "access")[];
}

// Global, server-owned catalog. User-owned favorites remain separate sync entities.
export const placeCatalog = pgTable("place_catalog", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  mode: trainingModeEnum("mode").notNull(),
  gymCategory: varchar("gym_category", { length: 20 }).$type<"brand" | "conventional">(),
  brand: varchar("brand", { length: 80 }),
  accessModel: varchar("access_model", { length: 30 }).$type<PlaceAccessModel>().notNull(),
  dayPassAvailable: boolean("day_pass_available"),
  area: varchar("area", { length: 120 }).notNull(),
  city: varchar("city", { length: 120 }).notNull(),
  address: text("address").notNull(),
  latitude: numeric("latitude", { mode: "number", precision: 10, scale: 7 }).notNull(),
  longitude: numeric("longitude", { mode: "number", precision: 10, scale: 7 }).notNull(),
  googleMapsUrl: text("google_maps_url").notNull(),
  sources: jsonb("sources").$type<PlaceSource[]>().notNull(),
  checkedAt: date("checked_at").notNull(),
  active: boolean("active").notNull().default(true),
  version: bigint("version", { mode: "bigint" }).notNull().default(sql`1`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("place_catalog_filters_idx").on(table.area, table.mode, table.gymCategory, table.accessModel),
  check("place_catalog_category", sql`(${table.mode} = 'gym' and ${table.gymCategory} is not null and ((${table.gymCategory} = 'brand' and ${table.brand} is not null) or (${table.gymCategory} = 'conventional' and ${table.brand} is null))) or (${table.mode} = 'calisthenics' and ${table.gymCategory} is null and ${table.brand} is null)`),
  check("place_catalog_access", sql`${table.accessModel} in ('membership', 'per_visit', 'membership_or_per_visit', 'public', 'unknown') and (${table.accessModel} not in ('per_visit', 'membership_or_per_visit') or ${table.dayPassAvailable} is true) and (${table.mode} <> 'gym' or ${table.accessModel} <> 'public')`),
  check("place_catalog_coordinates", sql`${table.latitude} between -90 and 90 and ${table.longitude} between -180 and 180`),
  check("place_catalog_sources", sql`jsonb_typeof(${table.sources}) = 'array' and jsonb_array_length(${table.sources}) > 0`),
  check("place_catalog_maps_url", sql`${table.googleMapsUrl} like 'https://www.google.com/maps/%'`),
  check("place_catalog_version", sql`${table.version} > 0`),
]);
