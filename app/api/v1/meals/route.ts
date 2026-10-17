import { apiJson, optionsHandler, privateHandler } from "@/src/lib/http";
import { listMeals, mealsQuerySchema } from "@/src/modules/meals/service";
import { queryParameters } from "@/src/lib/query";

export const GET = privateHandler(async ({ identity, request }) => {
  const query = mealsQuerySchema.parse(queryParameters(request.url));
  return apiJson(await listMeals(identity.internalUserId, query));
});
export const OPTIONS = optionsHandler(["GET"]);
