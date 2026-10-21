import { apiJson, optionsHandler, privateHandler, readJson } from "@/src/lib/http";
import { mutationKey, noQuery, resourceId, type IdContext } from "@/src/modules/online/routes";
import { deleteSchema } from "@/src/modules/online/dto";
import { removeResource } from "@/src/modules/online/resources";
import { workoutDetail } from "@/src/modules/online/workouts";
export const GET = (request: Request, context: IdContext) => privateHandler(async ({ identity, request }) => {
  noQuery(request); return apiJson(await workoutDetail(identity.internalUserId, await resourceId(context)));
})(request);
export const DELETE = (request: Request, context: IdContext) => privateHandler(async ({ identity, request }) => {
  noQuery(request); const key = mutationKey(request), id = await resourceId(context);
  return apiJson(await removeResource(identity.internalUserId, key, "workout_session", id, deleteSchema.parse(await readJson(request, 65536)).baseVersion));
})(request);
export const OPTIONS = optionsHandler(["GET", "DELETE"]);
