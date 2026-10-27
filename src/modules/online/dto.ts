import { z } from "zod";
import { entityPayloadSchemas } from "@/src/modules/sync/dto";
import { focusSchema, validateFocusPair } from "@/src/modules/programs/focus";
import { sessionTimingSchema } from "@/src/modules/workouts/measurement";

export const versionSchema = z.string().max(19).regex(/^(0|[1-9][0-9]*)$/)
  .pipe(z.string().refine(v => BigInt(v) <= BigInt("9223372036854775807"), "Version exceeds the supported range"));
export const idSchema = z.string().min(1).max(255).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const workoutDate = z.iso.date().refine(date => date >= "1900-01-01", "Workout date must not precede 1900-01-01");
export const keySchema = z.uuid().transform(v => v.toLowerCase());
export const deleteSchema = z.object({ baseVersion: versionSchema }).strict();
export const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(2048).optional(),
  mode: z.enum(["gym", "calisthenics"]).optional(),
}).strict();
const nonempty = (value: object) => Object.keys(value).length > 0;
const metadata = z.record(z.string(), z.unknown()).nullable();
export const resourceSchemas = {
  custom_program: entityPayloadSchemas.custom_program,
  user_exercise: entityPayloadSchemas.user_exercise,
  meal_entry: entityPayloadSchemas.meal_entry,
  social_draft: entityPayloadSchemas.social_draft.extend({ metadata }),
};
export const newExerciseSchema = z.object({ id: idSchema, data: resourceSchemas.user_exercise }).strict();
export const newExercisesSchema = z.array(newExerciseSchema).max(12)
  .refine(v => new Set(v.map(e => e.id)).size === v.length, "Duplicate new exercise IDs");
export const profilePatchSchema = entityPayloadSchemas.profile.omit({ setupCompleted: true, motivationEnabled: true }).partial().extend({
  motivationEnabled: z.boolean().optional(),
  goal: z.enum(["bulk", "cut", "maintenance", "maintain", "strength", "endurance", "muscle", "fat", "fit"])
    .transform(v => v === "maintain" ? "maintenance" : v).nullable().optional(),
  focus: focusSchema.nullable().optional(),
}).strict().superRefine(validateFocusPair).refine(nonempty, "Provide at least one changed field");
export const trainingPatchSchema = z.object({
  mode: z.enum(["gym", "calisthenics"]).optional(),
  equipment: z.array(idSchema).max(50).refine(v => new Set(v).size === v.length, "Duplicate equipment IDs").optional(),
  noEquipment: z.boolean().optional(),
}).strict().refine(nonempty, "Provide at least one changed field");
export const preferencesPatchSchema = entityPayloadSchemas.user_preferences.partial().strict().refine(nonempty, "Provide at least one changed field");
export const accountPatchSchema = z.object({
  baseVersions: z.object({ profile: versionSchema.optional(), trainingPreferences: versionSchema.optional(), userPreferences: versionSchema.optional() }).strict(),
  profile: profilePatchSchema.optional(), trainingPreferences: trainingPatchSchema.optional(), userPreferences: preferencesPatchSchema.optional(),
}).strict().superRefine((v, ctx) => {
  for (const field of ["profile", "trainingPreferences", "userPreferences"] as const) {
    if ((v[field] !== undefined) !== (v.baseVersions[field] !== undefined)) ctx.addIssue({ code: "custom", path: ["baseVersions", field], message: "Provide a version for exactly each changed resource" });
  }
  if (!v.profile && !v.trainingPreferences && !v.userPreferences) ctx.addIssue({ code: "custom", message: "Provide changed fields" });
});
export const completedWorkoutSchema = z.object({
  id: idSchema, source: z.enum(["custom", "recommended", "manual"]), programId: idSchema.optional(),
  mode: z.enum(["gym", "calisthenics"]).optional(),
  exerciseSnapshot: entityPayloadSchemas.workout_session.shape.exerciseSnapshot,
  setLog: entityPayloadSchemas.workout_session.shape.setLog,
  startedAt: z.iso.datetime({ offset: true }), finishedAt: z.iso.datetime({ offset: true }), recordedOn: workoutDate,
  note: z.string().max(2000).nullable().optional(),
  newExercises: newExercisesSchema.optional(),
  sessionTiming: sessionTimingSchema.optional(),
}).strict().superRefine((value, context) => {
  const explicit = value.exerciseSnapshot.some(e => e.mode !== undefined) || value.setLog.some(e => e.exerciseMode !== undefined);
  if (value.source === "manual" && value.mode === undefined) {
    if (value.exerciseSnapshot.some(e => e.mode === undefined) || value.setLog.some(e => e.exerciseMode === undefined)) context.addIssue({ code: "custom", message: "Manual workouts without top-level mode require mode on every exercise and exerciseMode on every set log" });
  } else {
    if (value.mode === undefined) context.addIssue({ code: "custom", path: ["mode"], message: "Program workouts require mode" });
    if (explicit) context.addIssue({ code: "custom", message: "Per-exercise modes require source manual and omission of top-level mode" });
  }
  if ((value.source !== "manual") !== (value.programId !== undefined)) context.addIssue({
    code: "custom", path: ["programId"], message: "Provide programId for custom/recommended only; omit it for manual workouts",
  });
  if (value.newExercises !== undefined && value.source !== "manual") context.addIssue({
    code: "custom", path: ["newExercises"], message: "newExercises is supported only for manual workouts",
  });
  const referenced = new Set(value.exerciseSnapshot.map(exercise => JSON.stringify([exercise.mode ?? value.mode, exercise.id])));
  for (const [index, exercise] of (value.newExercises ?? []).entries()) {
    if (!referenced.has(JSON.stringify([exercise.data.mode, exercise.id]))) context.addIssue({ code: "custom", path: ["newExercises", index, "id"], message: "Every new exercise must be referenced with its declared mode in exerciseSnapshot" });
  }
});
export const summaryQuerySchema = z.object({ from: z.iso.date(), to: z.iso.date() }).strict().refine(v => {
  const span = Date.parse(v.to) - Date.parse(v.from); return span >= 0 && span <= 366 * 86400000;
}, "Choose a range of at most 366 days");
export const dashboardQuerySchema = z.object({ date: z.iso.date() }).strict();
