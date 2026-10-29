import { z } from "zod";
import { equipmentQueryParams } from "@/src/modules/equipment/query";

export const exerciseQuerySchema = z.object({
  equipment: z.enum(["all", "dumbbell", "cable", "machine", "plate", "no_equipment"]).optional(),
  mode: z.enum(["gym", "calisthenics"]).optional(),
  equipmentIds: z.string().transform(value => value.split(","))
    .pipe(z.array(z.string().regex(/^[a-z][a-z0-9_]{0,79}$/)).min(1).max(32))
    .refine(ids => new Set(ids).size === ids.length, "Duplicate equipment IDs").optional(),
}).strict();

export function exerciseQuery(url: string) {
  return exerciseQuerySchema.parse(equipmentQueryParams(url));
}

export type ExerciseQuery = z.infer<typeof exerciseQuerySchema>;

export function matchesEquipmentCategory(requirements: string[][], category: ExerciseQuery["equipment"]) {
  if (!category || category === "all") return true;
  if (category === "no_equipment") return requirements.some(group => group.length === 0);
  return requirements.some(group => group.some(id => {
    const plate = id.includes("plate_loaded");
    const cable = id === "cable_machine" || id === "lat_pulldown_machine";
    if (category === "dumbbell") return id === "dumbbell";
    if (category === "cable") return cable;
    if (category === "plate") return plate;
    return id.endsWith("_machine") && !plate && !cable;
  }));
}
