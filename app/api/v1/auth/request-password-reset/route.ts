import { authOptions, authRoute } from "@/src/modules/auth/proxy";

export const POST = authRoute("request-password-reset");
export const OPTIONS = authOptions(["POST"]);
