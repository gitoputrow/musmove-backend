import { apiJson, optionsHandler, publicHandler } from "@/src/lib/http";
import { getExerciseCatalog } from "@/src/modules/catalog/exercises";

export const GET = publicHandler(async () =>
  apiJson(
    await getExerciseCatalog(),
    {
      headers: {
        "cache-control": "public, max-age=60, stale-while-revalidate=300",
      },
    },
  ),
);

export const OPTIONS = optionsHandler(["GET"]);

