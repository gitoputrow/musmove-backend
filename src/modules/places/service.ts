import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDatabase } from "@/src/db/client";
import { catalogState, placeCatalog, placeFavorites } from "@/src/db/schema";
import type { PlacesQuery } from "./query";

export async function getPlaceCatalog(query: PlacesQuery, userId?: string) {
  return getDatabase().transaction(async (transaction) => {
    const [state] = await transaction.select().from(catalogState).where(eq(catalogState.name, "places"));
    if (!state) throw new Error("Place catalog migration has not been applied");
    const conditions = [eq(placeCatalog.active, true)];
    if (query.area !== undefined) conditions.push(sql`lower(${placeCatalog.area}) = lower(${query.area})`);
    if (query.city !== undefined) conditions.push(sql`lower(${placeCatalog.city}) = lower(${query.city})`);
    if (query.mode !== undefined) conditions.push(eq(placeCatalog.mode, query.mode));
    if (query.gymCategory !== undefined) conditions.push(eq(placeCatalog.gymCategory, query.gymCategory));
    if (query.brand !== undefined) conditions.push(sql`lower(${placeCatalog.brand}) = lower(${query.brand})`);
    if (query.accessModel !== undefined) conditions.push(eq(placeCatalog.accessModel, query.accessModel));
    if (query.dayPassAvailable !== undefined) conditions.push(eq(placeCatalog.dayPassAvailable, query.dayPassAvailable));

    // Compute and filter before pagination. No external geocoding call or stored user location.
    const hasOrigin = query.latitude !== undefined && query.longitude !== undefined;
    const distance = hasOrigin ? sql<number>`(6371.0 * 2 * asin(sqrt(least(1.0, greatest(0.0,
      power(sin(radians(${placeCatalog.latitude}::double precision - ${query.latitude}::double precision) / 2), 2)
      + cos(radians(${query.latitude}::double precision)) * cos(radians(${placeCatalog.latitude}::double precision))
      * power(sin(radians(${placeCatalog.longitude}::double precision - ${query.longitude}::double precision) / 2), 2)
    )))))` : sql<number | null>`NULL::double precision`;
    if (query.radiusKm !== undefined) conditions.push(sql`${distance} <= ${query.radiusKm}`);
    const filter = and(...conditions);
    const [count] = await transaction.select({ total: sql<number>`count(*)::integer` }).from(placeCatalog).where(filter);
    const favorite = userId ? sql<boolean>`exists (
      select 1 from ${placeFavorites} where ${placeFavorites.userId} = ${userId}
        and ${placeFavorites.placeId} = ${placeCatalog.id} and ${isNull(placeFavorites.deletedAt)}
    )` : sql<boolean | null>`NULL::boolean`;
    const favoriteVersion = userId ? sql<string>`coalesce((select version::text from ${placeFavorites}
      where ${placeFavorites.userId}=${userId} and ${placeFavorites.placeId}=${placeCatalog.id}), '0')` : sql<string>`'0'`;
    const rows = await transaction.select({ place: placeCatalog, distanceKm: distance, isFavorite: favorite, favoriteVersion })
      .from(placeCatalog).where(filter).orderBy(...(hasOrigin ? [asc(distance)] : []), asc(placeCatalog.name), asc(placeCatalog.id))
      .limit(query.limit).offset(query.offset);
    return {
      catalogVersion: state.version.toString(),
      places: rows.map(({ place: { version, updatedAt, ...place }, distanceKm, isFavorite, favoriteVersion }) => ({
        ...place, version: version.toString(), updatedAt: updatedAt.toISOString(),
        distanceKm: distanceKm === null ? null : Math.round(distanceKm * 1000) / 1000,
        ...(userId ? { isFavorite, favoriteVersion } : {}),
      })),
      total: count.total, hasMore: query.offset + rows.length < count.total,
      nextOffset: query.offset + rows.length < count.total ? query.offset + query.limit : null,
      distanceType: hasOrigin ? "straight_line" : null,
      warnings: ["WEB_RESEARCH_NOT_ON_SITE_VERIFICATION", "CONFIRM_ACCESS_BEFORE_VISITING", "NULL_DAY_PASS_MEANS_UNKNOWN_NOT_UNAVAILABLE"],
    };
  }, { accessMode: "read only", isolationLevel: "repeatable read" });
}
