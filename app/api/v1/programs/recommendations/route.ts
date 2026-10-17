import { apiJson, optionsHandler, privateHandler } from "@/src/lib/http";
import { getProgramCatalog } from "@/src/modules/programs/service";

export const GET = privateHandler(async ({ identity }) => apiJson(await getProgramCatalog(identity.internalUserId)));
export const OPTIONS = optionsHandler(["GET"]);
