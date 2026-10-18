import { authOptions, authRoute } from "@/src/modules/auth/proxy";

export const POST = authRoute("sign-out");
export const OPTIONS = authOptions(["POST"]);
