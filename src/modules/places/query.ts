import { z } from "zod";
import { badRequest } from "@/src/lib/api-error";

const decimal = z.string().trim().regex(/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/).transform(Number);

export const placesQuerySchema = z.object({
  area: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  mode: z.enum(["gym", "calisthenics"]).optional(),
  gymCategory: z.enum(["brand", "conventional"]).optional(),
  brand: z.string().trim().min(1).max(80).optional(),
  accessModel: z.enum(["membership", "per_visit", "membership_or_per_visit", "public", "unknown"]).optional(),
  dayPassAvailable: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  latitude: decimal.pipe(z.number().min(-90).max(90)).optional(),
  longitude: decimal.pipe(z.number().min(-180).max(180)).optional(),
  radiusKm: decimal.pipe(z.number().positive().max(100)).optional(),
  limit: decimal.pipe(z.number().int().min(1).max(100)).default(50),
  offset: decimal.pipe(z.number().int().min(0).max(100000)).default(0),
}).strict().superRefine((value, context) => {
  if ((value.latitude === undefined) !== (value.longitude === undefined)) {
    context.addIssue({ code: "custom", path: ["latitude"], message: "Provide both latitude and longitude" });
  }
  if (value.radiusKm !== undefined && value.latitude === undefined) {
    context.addIssue({ code: "custom", path: ["radiusKm"], message: "Radius requires latitude and longitude" });
  }
  if (value.mode === "calisthenics" && (value.gymCategory !== undefined || value.brand !== undefined)) {
    context.addIssue({ code: "custom", path: ["gymCategory"], message: "Gym filters cannot be used for calisthenics" });
  }
});

export type PlacesQuery = z.infer<typeof placesQuerySchema>;

export function parsePlacesQuery(url: string): PlacesQuery {
  const params = new URL(url).searchParams;
  const entries: Record<string, string> = {};
  for (const [key, value] of params) {
    if (Object.hasOwn(entries, key)) throw badRequest("VALIDATION_ERROR", `Duplicate query parameter: ${key}`);
    Object.defineProperty(entries, key, { value, enumerable: true });
  }
  return placesQuerySchema.parse(entries);
}

// Great-circle distance, not road/travel distance. Also useful for contract tests.
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * radians / 2) ** 2
    + Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin((lon2 - lon1) * radians / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}
