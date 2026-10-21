import { z } from "zod";
import { apiJson, optionsHandler, privateHandler, readJson } from "@/src/lib/http";
import { queryParameters } from "@/src/lib/query";
import { deleteSchema, idSchema, keySchema, listSchema } from "./dto";
import { createResource, createSchema, detailResource, listResource, patchResource, patchSchema, removeResource } from "./resources";
import type { Resource } from "./store";

export type IdContext = { params: Promise<{ id: string }> };
export function noQuery(request: Request) { z.object({}).strict().parse(queryParameters(request.url)); }
export function mutationKey(request: Request) { return keySchema.parse(request.headers.get("idempotency-key")); }
export async function resourceId(context: IdContext) { return idSchema.parse((await context.params).id); }
export function collectionHandlers(type: Resource) {
  return {
    GET: privateHandler(async ({ identity, request }) => apiJson(await listResource(identity.internalUserId, type, listSchema.parse(queryParameters(request.url))))),
    POST: privateHandler(async ({ identity, request }) => {
      noQuery(request); const key = mutationKey(request), body = createSchema(type).parse(await readJson(request, 65536));
      return apiJson(await createResource(identity.internalUserId, key, type, body), { status: 201 });
    }),
    OPTIONS: optionsHandler(["GET", "POST"]),
  };
}
export function itemHandlers(type: Resource) {
  return {
    GET: (request: Request, context: IdContext) => privateHandler(async ({ identity, request }) => {
      noQuery(request); return apiJson(await detailResource(identity.internalUserId, type, await resourceId(context)));
    })(request),
    PATCH: (request: Request, context: IdContext) => privateHandler(async ({ identity, request }) => {
      noQuery(request); const key = mutationKey(request), id = await resourceId(context);
      return apiJson(await patchResource(identity.internalUserId, key, type, id, patchSchema(type).parse(await readJson(request, 65536))));
    })(request),
    DELETE: (request: Request, context: IdContext) => privateHandler(async ({ identity, request }) => {
      noQuery(request); const key = mutationKey(request), id = await resourceId(context);
      return apiJson(await removeResource(identity.internalUserId, key, type, id, deleteSchema.parse(await readJson(request, 65536)).baseVersion));
    })(request),
    OPTIONS: optionsHandler(["GET", "PATCH", "DELETE"]),
  };
}
