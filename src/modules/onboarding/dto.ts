import { z } from "zod";
import { entityPayloadSchemas } from "@/src/modules/sync/dto";

const version = z.string().max(19).regex(/^(0|[1-9][0-9]*)$/)
  .pipe(z.string().refine(value => BigInt(value) <= BigInt("9223372036854775807"), "Version exceeds the supported range"));
const goal = z.enum(["bulk", "cut", "maintenance", "maintain"])
  .transform(value => value === "maintain" ? "maintenance" as const : value);

// No draft/progress schema. This DTO is only submitted when all setup is ready.
export const completeOnboardingSchema = z.object({
  baseVersions: z.object({ profile: version, trainingPreferences: version, userPreferences: version.optional() }).strict(),
  profile: entityPayloadSchemas.profile.omit({ setupCompleted: true }).extend({
    ageYears: z.number().int().min(1).max(150),
    goal,
    dailyActivity: z.enum(["light", "moderate", "vigorous"]),
    trainingFrequency: z.number().int().min(1).max(7),
    sessionMinutes: z.number().int().min(10).max(180),
    programSource: z.enum(["app", "custom"]),
    motivationEnabled: z.boolean(),
    motivationReason: z.string().trim().min(1).max(80),
    focus: z.enum(["full", "leg", "chest", "back", "arm"]).nullable().optional(),
  }).strict().superRefine((profile, context) => {
    if (profile.programSource === "app" && !profile.focus) {
      context.addIssue({ code: "custom", path: ["focus"], message: "Choose one focus for an app-generated program" });
    }
  }),
  trainingPreferences: z.object({
    mode: z.enum(["gym", "calisthenics"]),
    equipment: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,79}$/)).max(50)
      .refine(items => new Set(items).size === items.length, "Duplicate equipment IDs"),
    noEquipment: z.boolean(),
  }).strict().refine(value => value.noEquipment ? value.equipment.length === 0 : value.equipment.length > 0,
    "Choose equipment or explicitly confirm no equipment"),
}).strict();

export const onboardingKeySchema = z.uuid();
export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;
