import { apiJson, optionsHandler, privateHandler, readJson } from "@/src/lib/http";
import { queryParameters } from "@/src/lib/query";
import { releaseSnapshot, snapshotPage, snapshotPageSchema, startSnapshot, startSnapshotSchema } from "@/src/modules/sync/snapshots";
export const maxDuration = 60;
export const POST = privateHandler(async ({ identity, request }) => {
  const body = startSnapshotSchema.parse(await readJson(request));
  return apiJson(await startSnapshot(identity.internalUserId, body.snapshotId));
}, "bootstrap");
export const GET = privateHandler(async ({ identity, request }) => apiJson(await snapshotPage(identity.internalUserId, snapshotPageSchema.parse(queryParameters(request.url)))));
export const DELETE = privateHandler(async ({ identity, request }) => {
  const query = startSnapshotSchema.parse(queryParameters(request.url));
  return apiJson(await releaseSnapshot(identity.internalUserId, query.snapshotId));
});
export const OPTIONS = optionsHandler(["POST", "GET", "DELETE"]);
