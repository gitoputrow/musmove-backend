import { apiJson, optionsHandler, privateHandler } from "@/src/lib/http";
import { getNutritionTargets } from "@/src/modules/nutrition/storage";

export const GET = privateHandler(async ({ identity }) => apiJson(await getNutritionTargets(identity.internalUserId)));
export const OPTIONS = optionsHandler(["GET"]);
