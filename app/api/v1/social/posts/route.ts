import { apiJson, optionsHandler, privateHandler, readJson } from "@/src/lib/http";
import { queryParameters } from "@/src/lib/query";
import { deletePost, feedQuerySchema, postIdSchema, publishPost, publishPostSchema, readFeed, requireSocialEnabled } from "@/src/modules/social/service";
export const GET = privateHandler(async ({ identity, request }) => { requireSocialEnabled(); return apiJson(await readFeed(identity.internalUserId, feedQuerySchema.parse(queryParameters(request.url)))); });
export const POST = privateHandler(async ({ identity, request }) => { requireSocialEnabled(); return apiJson(await publishPost(identity.internalUserId, publishPostSchema.parse(await readJson(request))), { status: 201 }); }, "social-publish");
export const DELETE = privateHandler(async ({ identity, request }) => apiJson(await deletePost(identity.internalUserId, postIdSchema.parse(queryParameters(request.url)).postId)));
export const OPTIONS = optionsHandler(["GET", "POST", "DELETE"]);
