import { apiJson, optionsHandler, privateHandler, readJson } from "@/src/lib/http";
import { reportPost, reportPostSchema } from "@/src/modules/social/service";
export const POST = privateHandler(async ({ identity, request }) => apiJson(await reportPost(identity.internalUserId, reportPostSchema.parse(await readJson(request))), { status: 202 }), "social-report");
export const OPTIONS = optionsHandler(["POST"]);
