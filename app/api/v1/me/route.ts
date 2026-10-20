import { apiJson, optionsHandler, privateHandler } from "@/src/lib/http";
import { getAccountSetup } from "@/src/modules/onboarding/service";

export const GET = privateHandler(async ({ identity }) =>
  apiJson({
    user: {
      email: identity.email,
      id: identity.internalUserId,
      status: "active",
    },
    ...await getAccountSetup(identity.internalUserId),
  }),
);

export const OPTIONS = optionsHandler(["GET"]);

