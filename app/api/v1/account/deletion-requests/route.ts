import { markDeletionRequested } from "@/src/lib/auth/verify-identity";
import { apiJson, optionsHandler, privateHandler } from "@/src/lib/http";

export const POST = privateHandler(async ({ identity }) => {
  await markDeletionRequested(identity.internalUserId);
  return apiJson({ status: "deletion_requested" }, { status: 202 });
});

export const OPTIONS = optionsHandler(["POST"]);
