import { apiJson, optionsHandler, publicHandler } from "@/src/lib/http";
import { getMealCatalog } from "@/src/modules/meals/service";
import { parseMealCatalogQuery } from "@/src/modules/meals/query";

export const GET = publicHandler(async ({ request }) => apiJson(await getMealCatalog(parseMealCatalogQuery(request.url))));
export const OPTIONS = optionsHandler(["GET"]);
