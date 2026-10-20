import { z } from "zod";
import { apiJson, optionsHandler, privateHandler, readJson } from "@/src/lib/http";
import { queryParameters } from "@/src/lib/query";
import { completeOnboardingSchema, onboardingKeySchema } from "@/src/modules/onboarding/dto";
import { completeOnboarding } from "@/src/modules/onboarding/service";

export const POST = privateHandler(async ({ identity, request }) => {
  z.object({}).strict().parse(queryParameters(request.url));
  const key = onboardingKeySchema.parse(request.headers.get("idempotency-key"));
  const input = completeOnboardingSchema.parse(await readJson(request, 65536));
  return apiJson(await completeOnboarding(identity.internalUserId, key, input));
});
export const OPTIONS = optionsHandler(["POST"]);
