import { apiJson, optionsHandler, privateHandler, readJson } from "@/src/lib/http";
import { demoImportSchema, importDemo } from "@/src/modules/imports/demo";
export const maxDuration = 60;

export const POST = privateHandler(async ({ identity, request }) => {
  const input = demoImportSchema.parse(await readJson(request));
  const result = await importDemo(identity.internalUserId, input);
  return apiJson(result, { status: result.duplicate ? 200 : 201 });
}, "import");

export const OPTIONS = optionsHandler(["POST"]);
