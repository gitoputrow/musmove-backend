import { apiJson, optionsHandler, publicHandler } from "@/src/lib/http";
import { getExerciseCatalog } from "@/src/modules/catalog/exercises";
import { exerciseQuery } from "@/src/modules/catalog/exercise-query";

export const GET = publicHandler(async ({ request }) =>
  apiJson(
    await getExerciseCatalog(exerciseQuery(request.url)),
    {
      headers: {
        "cache-control": "public, max-age=60, stale-while-revalidate=300",
      },
    },
  ),
);

export const OPTIONS = optionsHandler(["GET"]);

