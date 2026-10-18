import { authOptions, authRoute } from "@/src/modules/auth/proxy";

export const POST = authRoute("sign-up/email");
export const OPTIONS = authOptions(["POST"]);
