import { authOptions, authRoute } from "@/src/modules/auth/proxy";

export const GET = authRoute("token");
export const OPTIONS = authOptions(["GET"]);
