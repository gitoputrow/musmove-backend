import { z } from "zod";
import { badRequest } from "@/src/lib/api-error";

const equipmentId = z.string().regex(/^[a-z][a-z0-9_]{0,79}$/);
export const equipmentSearchSchema = z.object({ q: z.string().trim().min(2).max(120).optional() }).strict();
export const equipmentExercisesSchema = z.object({
  equipmentIds: z.string().transform((value) => value.split(",")).pipe(z.array(equipmentId).min(1).max(32))
    .refine((ids) => new Set(ids).size === ids.length, { message: "Duplicate equipment IDs" }),
  mode: z.enum(["gym", "calisthenics"]).optional(),
}).strict();

export function equipmentQueryParams(url: string) {
  const params: Record<string, string> = {};
  for (const [key, value] of new URL(url).searchParams) {
    if (Object.hasOwn(params, key)) throw badRequest("VALIDATION_ERROR", `Duplicate query parameter: ${key}`);
    Object.defineProperty(params, key, { value, enumerable: true });
  }
  return params;
}
