import { apiJson, optionsHandler, publicHandler } from "@/src/lib/http";
import { getProgramCatalog } from "@/src/modules/programs/service";

export const GET = publicHandler(async () => apiJson(await getProgramCatalog(), {
  headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" },
}));
export const OPTIONS = optionsHandler(["GET"]);
