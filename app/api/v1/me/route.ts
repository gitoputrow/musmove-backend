import { apiJson, optionsHandler, privateHandler } from "@/src/lib/http";

export const GET = privateHandler(async ({ identity }) =>
  apiJson({
    user: {
      email: identity.email,
      id: identity.internalUserId,
      status: "active",
    },
  }),
);

export const OPTIONS = optionsHandler(["GET"]);

