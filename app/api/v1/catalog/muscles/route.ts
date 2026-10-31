import { z } from "zod";
import { apiJson, optionsHandler, publicHandler } from "@/src/lib/http";
import { getMuscleCatalog } from "@/src/modules/catalog/muscle-catalog";
import { equipmentQueryParams } from "@/src/modules/equipment/query";

export const GET = publicHandler(async ({ request }) => {
  z.object({}).strict().parse(equipmentQueryParams(request.url));
  return apiJson(getMuscleCatalog(), { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } });
});
export const OPTIONS = optionsHandler(["GET"]);
