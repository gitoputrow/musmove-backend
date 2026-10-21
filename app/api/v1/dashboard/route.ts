import { apiJson, optionsHandler, privateHandler } from "@/src/lib/http";
import { queryParameters } from "@/src/lib/query";
import { dashboardQuerySchema } from "@/src/modules/online/dto";
import { dashboard } from "@/src/modules/online/summaries";
export const GET = privateHandler(async ({ identity, request }) => apiJson(await dashboard(identity.internalUserId, dashboardQuerySchema.parse(queryParameters(request.url)).date)));
export const OPTIONS = optionsHandler(["GET"]);
