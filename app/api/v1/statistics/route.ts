import { apiJson, optionsHandler, privateHandler } from "@/src/lib/http";
import { queryParameters } from "@/src/lib/query";
import { summaryQuerySchema } from "@/src/modules/online/dto";
import { statistics } from "@/src/modules/online/summaries";
export const GET = privateHandler(async ({ identity, request }) => apiJson(await statistics(identity.internalUserId, summaryQuerySchema.parse(queryParameters(request.url)))));
export const OPTIONS = optionsHandler(["GET"]);
