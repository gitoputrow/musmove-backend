import { apiJson, optionsHandler, privateHandler, readJson } from "@/src/lib/http";
import { listWorkouts, workoutQuerySchema } from "@/src/modules/workouts/service";
import { queryParameters } from "@/src/lib/query";
import { mutationKey, noQuery } from "@/src/modules/online/routes";
import { completedWorkoutSchema } from "@/src/modules/online/dto";
import { recordCompletedWorkout } from "@/src/modules/online/workouts";

export const GET = privateHandler(async ({ identity, request }) => {
  const query = workoutQuerySchema.parse(
    queryParameters(request.url),
  );
  return apiJson(await listWorkouts(identity.internalUserId, query));
});

export const POST = privateHandler(async ({ identity, request }) => {
  noQuery(request); const key = mutationKey(request);
  return apiJson(await recordCompletedWorkout(identity.internalUserId, key, completedWorkoutSchema.parse(await readJson(request, 65536))), { status: 201 });
});
export const OPTIONS = optionsHandler(["GET", "POST"]);
