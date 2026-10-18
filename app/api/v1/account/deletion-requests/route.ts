import { apiJson, optionsHandler, privateHandler } from "@/src/lib/http";
import { readDeletionStatus, requestAccountDeletion } from "@/src/modules/accounts/deletion";
import { queryParameters } from "@/src/lib/query";
import { badRequest } from "@/src/lib/api-error";

function noQuery(url: string) {
  if (Object.keys(queryParameters(url)).length) throw badRequest("VALIDATION_ERROR", "Deletion endpoints do not accept query parameters");
}

export const POST = privateHandler(async ({ identity, request }) => {
  noQuery(request.url);
  if (request.body) throw badRequest("VALIDATION_ERROR", "Deletion requests do not accept a body");
  return apiJson(await requestAccountDeletion(identity.internalUserId), { status: 202 });
}, undefined, { allowInactive: true });

export const GET = privateHandler(async ({ identity, request }) => { noQuery(request.url); return apiJson(await readDeletionStatus(identity.internalUserId)); }, undefined, { allowInactive: true });

export const OPTIONS = optionsHandler(["POST", "GET"]);
