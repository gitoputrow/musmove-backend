import { apiJson, optionsHandler, publicHandler } from "@/src/lib/http";
import { parsePlacesQuery } from "@/src/modules/places/query";
import { getPlaceCatalog } from "@/src/modules/places/service";

// Origin coordinates may be present: do not cache this response in shared caches.
export const GET = publicHandler(async ({ request }) =>
  apiJson(await getPlaceCatalog(parsePlacesQuery(request.url))),
);
export const OPTIONS = optionsHandler(["GET"]);
