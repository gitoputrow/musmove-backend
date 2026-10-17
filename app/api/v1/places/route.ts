import { apiJson, optionsHandler, privateHandler } from "@/src/lib/http";
import { parsePlacesQuery } from "@/src/modules/places/query";
import { getPlaceCatalog } from "@/src/modules/places/service";

export const GET = privateHandler(async ({ request, identity }) =>
  apiJson(await getPlaceCatalog(parsePlacesQuery(request.url), identity.internalUserId)),
);
export const OPTIONS = optionsHandler(["GET"]);
