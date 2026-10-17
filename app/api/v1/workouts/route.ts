import { apiJson, optionsHandler, privateHandler } from "@/src/lib/http";
import { listWorkouts, workoutQuerySchema } from "@/src/modules/workouts/service";
import { queryParameters } from "@/src/lib/query";

export const GET = privateHandler(async ({ identity, request }) => {
  const query = workoutQuerySchema.parse(
    queryParameters(request.url),
  );
  return apiJson(await listWorkouts(identity.internalUserId, query));
});

export const OPTIONS = optionsHandler(["GET"]);
