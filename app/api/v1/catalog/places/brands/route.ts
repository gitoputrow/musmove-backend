import { z } from "zod";
import { apiJson, optionsHandler, publicHandler } from "@/src/lib/http";
import { queryParameters } from "@/src/lib/query";
import { getGymBrands } from "@/src/modules/places/service";

export const GET = publicHandler(async ({ request }) => {
  z.object({}).strict().parse(queryParameters(request.url));
  return apiJson(await getGymBrands());
});
export const OPTIONS = optionsHandler(["GET"]);
