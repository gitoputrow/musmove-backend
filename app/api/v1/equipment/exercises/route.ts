import { apiJson, optionsHandler, publicHandler } from "@/src/lib/http";
import { equipmentExercisesSchema, equipmentQueryParams } from "@/src/modules/equipment/query";
import { getEquipmentExercises } from "@/src/modules/equipment/service";

export const GET = publicHandler(async ({ request }) => {
  const query = equipmentExercisesSchema.parse(equipmentQueryParams(request.url));
  return apiJson(await getEquipmentExercises(query.equipmentIds, query.mode));
});
export const OPTIONS = optionsHandler(["GET"]);
