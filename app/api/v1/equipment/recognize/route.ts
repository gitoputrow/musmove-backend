import { apiJson, optionsHandler, privateHandler } from "@/src/lib/http";
import { readEquipmentPhoto } from "@/src/modules/equipment/photo";
import { getEquipmentCatalog } from "@/src/modules/equipment/service";
import { recognizeEquipmentPhoto, visionConfiguration } from "@/src/modules/equipment/vision-client";
import { withEquipmentScanLimit } from "@/src/modules/equipment/scan-limit";
export const maxDuration = 60;

export const POST = privateHandler(async ({ request, identity }) => {
  visionConfiguration();
  return withEquipmentScanLimit(identity.internalUserId, async () => {
    const photo = await readEquipmentPhoto(request);
    const catalog = await getEquipmentCatalog();
    const result = await recognizeEquipmentPhoto(photo, catalog.equipment, request.signal);
    return apiJson({ ...result, equipmentCatalogVersion: catalog.catalogVersion,
      requiresConfirmation: true,
      warnings: ["MODEL_SCORES_ARE_NOT_CALIBRATED_ACCURACY", "CONFIRM_EQUIPMENT_BEFORE_SELECTING_EXERCISES", "FOCUS_PHOTO_ON_ONE_EQUIPMENT_ITEM"],
    });
  });
}, "scan");
export const OPTIONS = optionsHandler(["POST"]);
