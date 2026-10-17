import { z } from "zod";
import { badRequest } from "@/src/lib/api-error";
import { foodGroups } from "./types";

const integer = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().safe());

export const mealCatalogQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  foodGroup: z.enum(foodGroups).optional(),
  foodKind: z.enum(["single", "processed_or_composite"]).optional(),
  includeDemo: z.enum(["true", "false"]).transform((value) => value === "true").default(false),
  limit: integer.pipe(z.number().min(1).max(100)).default(50),
  offset: integer.pipe(z.number().min(0).max(100000)).default(0),
}).strict();

export type MealCatalogQuery = z.infer<typeof mealCatalogQuerySchema>;

export function parseMealCatalogQuery(url: string): MealCatalogQuery {
  const input: Record<string, string> = {};
  for (const [key, value] of new URL(url).searchParams) {
    if (Object.hasOwn(input, key)) throw badRequest("VALIDATION_ERROR", `Duplicate query parameter: ${key}`);
    Object.defineProperty(input, key, { value, enumerable: true });
  }
  return mealCatalogQuerySchema.parse(input);
}
