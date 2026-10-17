import { apiJson, optionsHandler, privateHandler } from "@/src/lib/http";
import { pullQuerySchema } from "@/src/modules/sync/dto";
import { pullChanges } from "@/src/modules/sync/service";
import { queryParameters } from "@/src/lib/query";

export const GET = privateHandler(async ({ identity, request }) => {
  const query = pullQuerySchema.parse(queryParameters(request.url));
  return apiJson(await pullChanges(identity.internalUserId, query.cursor, query.limit));
});

export const OPTIONS = optionsHandler(["GET"]);

