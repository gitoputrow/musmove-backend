import { apiJson, optionsHandler, privateHandler, readJson } from "@/src/lib/http";
import { getAccountSetup } from "@/src/modules/onboarding/service";
import { patchAccount } from "@/src/modules/online/account";
import { accountPatchSchema } from "@/src/modules/online/dto";
import { mutationKey, noQuery } from "@/src/modules/online/routes";

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

export const PATCH = privateHandler(async ({ identity, request }) => {
  noQuery(request); const key = mutationKey(request);
  return apiJson(await patchAccount(identity.internalUserId, key, accountPatchSchema.parse(await readJson(request, 65536))));
});

export const OPTIONS = optionsHandler(["GET", "PATCH"]);

