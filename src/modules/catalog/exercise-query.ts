import { z } from "zod";
import { equipmentQueryParams } from "@/src/modules/equipment/query";
import { muscleAreas, type MuscleTargets } from "@/src/modules/workouts/measurement";

// UI grouping, not a claim about whether a muscle crosses the upper/lower body.
export const musclesByBodyPart = {
  upper_body: ["chest", "shoulders", "biceps", "triceps", "forearms", "abs", "obliques", "upperBack", "lats", "lowerBack"],
  lower_body: ["glutes", "quadriceps", "hamstrings", "calves"],
} as const;

export const exerciseQuerySchema = z.object({
  equipment: z.enum(["all", "dumbbell", "cable", "machine", "plate", "no_equipment"]).optional(),
  mode: z.enum(["gym", "calisthenics"]).optional(),
  bodyPart: z.enum(["upper_body", "lower_body"]).optional(),
  muscle: z.enum(muscleAreas).optional(),
  muscles: z.string().transform(value => value.split(","))
    .pipe(z.array(z.enum(muscleAreas)).min(1).max(muscleAreas.length))
    .refine(values => new Set(values).size === values.length, "Duplicate muscle IDs").optional(),
  muscleRole: z.enum(["primary", "secondary", "any"]).optional(),
  equipmentIds: z.string().transform(value => value.split(","))
    .pipe(z.array(z.string().regex(/^[a-z][a-z0-9_]{0,79}$/)).min(1).max(32))
    .refine(ids => new Set(ids).size === ids.length, "Duplicate equipment IDs").optional(),
}).strict().superRefine((query, ctx) => {
  if (query.muscle && query.muscles) {
    ctx.addIssue({ code: "custom", path: ["muscles"], message: "Use muscle or muscles, not both" });
  }
  const requested = query.muscles ?? (query.muscle ? [query.muscle] : []);
  if (query.bodyPart && requested.some(muscle => !(musclesByBodyPart[query.bodyPart!] as readonly string[]).includes(muscle))) {
    ctx.addIssue({ code: "custom", path: ["muscle"], message: "Muscle does not belong to the selected body part" });
  }
});

export function exerciseQuery(url: string) {
  return exerciseQuerySchema.parse(equipmentQueryParams(url));
}

export type ExerciseQuery = z.infer<typeof exerciseQuerySchema>;

export function matchesMuscleTargets(targets: MuscleTargets | null, query: ExerciseQuery) {
  if (!query.bodyPart && !query.muscle && !query.muscles) return true;
  if (!targets) return false;
  const selected = query.muscleRole === "secondary" ? targets.secondary
    : query.muscleRole === "any" ? [...targets.primary, ...targets.secondary] : targets.primary;
  const requested = query.muscles ?? (query.muscle ? [query.muscle] : undefined);
  return selected.some(muscle => (!query.bodyPart || (musclesByBodyPart[query.bodyPart] as readonly string[]).includes(muscle)) &&
    (!requested || requested.includes(muscle)));
}

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
