import { authOptions, authRoute } from "@/src/modules/auth/proxy";

export const POST = authRoute("sign-in/email");
export const OPTIONS = authOptions(["POST"]);
