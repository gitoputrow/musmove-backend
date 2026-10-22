import { apiJson, optionsHandler, publicHandler } from "@/src/lib/http";

export const GET = publicHandler(async () => apiJson({
  apiVersion: "1.1.0",
  capabilities: { resumableSnapshots: true, deletedIdentityGuard: true, textCommunity: true, passwordResetWebCallback: true, nativeAuthProxy: true, nativeAuthCanonicalCookie: true, nativeAuthNoCallback: true, atomicAccountPatch: true, onlineResourceApi: true, completedWorkoutSubmission: true, manualWorkoutAtomicExercises: true, multiMuscleFocus: true },
  socialPublishingEnabled: process.env.SOCIAL_PUBLISHING_ENABLED === "true",
}));
export const OPTIONS = optionsHandler(["GET"]);
