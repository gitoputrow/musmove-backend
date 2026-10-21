import { apiJson, optionsHandler, privateHandler } from "@/src/lib/http";
import { listMeals, mealsQuerySchema } from "@/src/modules/meals/service";
import { queryParameters } from "@/src/lib/query";
import { collectionHandlers } from "@/src/modules/online/routes";

export const GET = privateHandler(async ({ identity, request }) => {
  const query = mealsQuerySchema.parse(queryParameters(request.url));
  return apiJson(await listMeals(identity.internalUserId, query));
});
export const POST = collectionHandlers("meal_entry").POST;
export const OPTIONS = optionsHandler(["GET", "POST"]);
