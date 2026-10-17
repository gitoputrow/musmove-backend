import { apiJson, optionsHandler, privateHandler } from "@/src/lib/http";
import { bootstrap } from "@/src/modules/sync/service";

export const GET = privateHandler(async ({ identity }) =>
  apiJson(await bootstrap(identity.internalUserId)),
  "bootstrap",
);

export const OPTIONS = optionsHandler(["GET"]);

