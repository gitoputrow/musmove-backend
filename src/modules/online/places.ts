import { and, eq } from "drizzle-orm";
import { placeCatalog } from "@/src/db/schema";
import { ApiError } from "@/src/lib/api-error";
import { expectVersion, mutateOnline, readItem } from "./store";

export function setFavorite(userId: string, key: string, placeId: string, baseVersion: string, favorite: boolean) {
  return mutateOnline(userId, key, `favorite.${favorite}:${placeId}`, { baseVersion }, async ctx => {
    const current = await readItem(ctx.tx, userId, "place_favorite", placeId);
    expectVersion(current, baseVersion);
    const currentlyFavorite = Boolean(current && !current.deletedAt);
    if (currentlyFavorite === favorite) return { placeId, isFavorite: favorite, favoriteVersion: current?.version ?? "0" };
    if (favorite) {
      const [place] = await ctx.tx.select({ id: placeCatalog.id }).from(placeCatalog).where(and(eq(placeCatalog.id, placeId), eq(placeCatalog.active, true)));
      if (!place) throw new ApiError(404, "PLACE_NOT_AVAILABLE", "Place not found");
    }
    const item = favorite ? await ctx.put("place_favorite", placeId, baseVersion, {}) : await ctx.remove("place_favorite", placeId, baseVersion);
    return { placeId, isFavorite: favorite, favoriteVersion: item.version };
  });
}
