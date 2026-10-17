import { apiJson, optionsHandler, privateHandler, readJson } from "@/src/lib/http";
import { syncPushSchema } from "@/src/modules/sync/dto";
import { pushOperations } from "@/src/modules/sync/service";
export const maxDuration = 60;

export const POST = privateHandler(async ({ identity, request }) => {
  const input = syncPushSchema.parse(await readJson(request));
  return apiJson(await pushOperations(identity.internalUserId, input));
});

export const OPTIONS = optionsHandler(["POST"]);

