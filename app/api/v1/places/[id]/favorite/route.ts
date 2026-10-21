import { apiJson, optionsHandler, privateHandler, readJson } from "@/src/lib/http";
import { mutationKey, noQuery, resourceId, type IdContext } from "@/src/modules/online/routes";
import { deleteSchema } from "@/src/modules/online/dto";
import { setFavorite } from "@/src/modules/online/places";
function handler(favorite: boolean) {
  return (request: Request, context: IdContext) => privateHandler(async ({ identity, request }) => {
    noQuery(request); const key = mutationKey(request), id = await resourceId(context);
    return apiJson(await setFavorite(identity.internalUserId, key, id, deleteSchema.parse(await readJson(request, 65536)).baseVersion, favorite));
  })(request);
}
export const PUT = handler(true);
export const DELETE = handler(false);
export const OPTIONS = optionsHandler(["PUT", "DELETE"]);
