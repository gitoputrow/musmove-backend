import { authOptions, authRoute } from "@/src/modules/auth/proxy";

export const GET = authRoute("get-session");
export const OPTIONS = authOptions(["GET"]);
