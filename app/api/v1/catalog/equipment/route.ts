import { apiJson, optionsHandler, publicHandler } from "@/src/lib/http";
import { equipmentQueryParams, equipmentSearchSchema } from "@/src/modules/equipment/query";
import { getEquipmentCatalog } from "@/src/modules/equipment/service";

export const GET = publicHandler(async ({ request }) => {
  const query = equipmentSearchSchema.parse(equipmentQueryParams(request.url));
  return apiJson(await getEquipmentCatalog(query.q));
});
export const OPTIONS = optionsHandler(["GET"]);
