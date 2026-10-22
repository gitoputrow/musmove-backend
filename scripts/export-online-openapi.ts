// Prints a deterministic OpenAPI fragment. No env, DB, auth or network access.
// Regenerate docs/openapi-online.json from stdout; keep the primary YAML's refs.
import { z } from "zod";
import { entityPayloadSchemas } from "../src/modules/sync/dto";
import { accountPatchSchema, completedWorkoutSchema, dashboardQuerySchema, deleteSchema, idSchema, keySchema,
  newExercisesSchema, resourceSchemas, summaryQuerySchema, versionSchema } from "../src/modules/online/dto";

type ObjectSchema = Record<string, unknown>;
const base = "./openapi.yaml#/components/schemas/";
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const original = (name: string) => ({ $ref: `${base}${name}` });
const nullable = (value: ObjectSchema) => ({ anyOf: [value, { type: "null" }] });
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", required, properties });
const array = (items: ObjectSchema) => ({ type: "array", items });
const json = (schema: ObjectSchema) => ({ "application/json": { schema } });
function fromZod(schema: z.ZodType): ObjectSchema {
  const value = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  const { $schema: _dialect, ...rest } = value; void _dialect; return rest;
}
const schemas: Record<string, ObjectSchema> = {
  Version: fromZod(versionSchema), Id: fromZod(idSchema), DeleteInput: fromZod(deleteSchema), AccountPatchInput: fromZod(accountPatchSchema),
  CompletedWorkoutInput: fromZod(completedWorkoutSchema),
  UserPreferences: fromZod(entityPayloadSchemas.user_preferences.extend({ version: versionSchema, updatedAt: z.iso.datetime({ offset: true }) })),
  Setup: object({ setupCompleted: { type: "boolean" }, profile: nullable(original("SetupProfile")),
    trainingPreferences: nullable(original("SetupTrainingPreferences")), userPreferences: nullable(ref("UserPreferences")), versions: original("SetupVersions") }),
  Account: object({ user: object({ id: { type: "string", format: "uuid" }, email: { type: ["string", "null"] }, status: { const: "active" } }),
    setupCompleted: { type: "boolean" }, profile: nullable(original("SetupProfile")), trainingPreferences: nullable(original("SetupTrainingPreferences")),
    userPreferences: nullable(ref("UserPreferences")), versions: original("SetupVersions") }),
  AccountPatchResponse: { allOf: [ref("Setup"), object({ nutritionTargets: original("NutritionTargets") })] },
  DailyMealSummary: object({ entryCount: { type: "integer" }, reportedTotals: original("MealNutrients"), demoTotals: original("MealNutrients"),
    demoEntryCount: { type: "integer" }, undatedLegacyEntryCount: { type: "integer" }, remaining: nullable(original("MealNutrients")) }),
  MealJournalSummary: object({ date: { type: "string", format: "date" }, summary: ref("DailyMealSummary"), targets: original("NutritionTargets"), warnings: array({ type: "string" }) }),
  Deleted: object({ id: ref("Id"), deleted: { const: true }, version: ref("Version") }),
  Favorite: object({ placeId: ref("Id"), isFavorite: { type: "boolean" }, favoriteVersion: ref("Version") }),
  WorkoutDay: object({ date: { type: "string", format: "date" }, completed: { type: "integer" }, aborted: { type: "integer" }, active: { type: "integer" }, durationMinutes: { type: "number" } }),
  ScheduledProgram: object({ id: ref("Id"), mode: { enum: ["gym", "calisthenics"] }, name: { type: "string" }, weekday: { type: "integer", minimum: 1, maximum: 7 }, durationMinutes: { type: "integer" }, version: ref("Version") }),
};
const patchProfile = (schemas.AccountPatchInput.properties as Record<string, ObjectSchema>).profile;
(patchProfile.properties as Record<string, ObjectSchema>).focusAreas = original("FocusAreas");
patchProfile.allOf = [original("FocusInputCompatibility")];
const meta = { id: idSchema, version: versionSchema, updatedAt: z.iso.datetime({ offset: true }) };
const resourceNames = { custom_program: "CustomProgram", user_exercise: "CustomExercise", meal_entry: "Meal", social_draft: "SocialDraft" } as const;
schemas.Workout = fromZod(z.object(entityPayloadSchemas.workout_session.shape).extend(meta));
schemas.WorkoutResponse = object({ item: ref("Workout") });
schemas.CompletedWorkoutResponse = object({ item: ref("Workout"), exercises: {
  ...array(ref("CustomExercise")),
  description: "Canonical newly created exercises in request order, with string versions; empty for fresh submissions without newExercises. Optional only because pre-upgrade saved receipts replay the original item-only response unchanged.",
} }, ["item"]);
schemas.CompletedWorkoutInput.allOf = [{ if: { required: ["newExercises"] }, then: { properties: { source: { const: "manual" } } } }];
schemas.WorkoutList = object({ items: array(ref("Workout")), nextCursor: { type: ["string", "null"] } });
schemas.MealList = object({ date: { type: "string", format: "date" }, entries: array(original("MealLogItem")), hasMore: { type: "boolean" },
  nextOffset: { type: ["integer", "null"] }, summary: ref("DailyMealSummary"), targets: original("NutritionTargets"), warnings: array({ type: "string" }) });
schemas.Schedule = object({ from: { type: "string", format: "date" }, to: { type: "string", format: "date" }, weekdayConvention: { const: "ISO_MONDAY_1_SUNDAY_7" },
  weeklyPrograms: array(ref("ScheduledProgram")), workoutDays: array(ref("WorkoutDay")) });
schemas.Statistics = object({ from: { type: "string", format: "date" }, to: { type: "string", format: "date" }, workoutDays: array(ref("WorkoutDay")),
  mealDays: array(object({ date: { type: "string", format: "date" }, entryCount: { type: "integer" }, caloriesKcal: { type: "number" }, proteinGrams: { type: "number" } })),
  totals: object({ completedWorkouts: { type: "integer" }, abortedWorkouts: { type: "integer" }, durationMinutes: { type: "number" }, completedSets: { type: "integer" }, reportedReps: { type: "number" }, reportedExternalVolumeKg: { type: "number" }, setsMissingLoad: { type: "integer" } }), warnings: array({ type: "string" }) });
schemas.Dashboard = object({ date: { type: "string", format: "date" }, setupCompleted: { type: "boolean" },
  scheduledPrograms: array(ref("ScheduledProgram")), workoutDays: array(ref("WorkoutDay")),
  meals: object({ summary: ref("DailyMealSummary"), warnings: array({ type: "string" }) }), nutritionTargets: nullable(original("NutritionTargets")) });

const error = { $ref: "./openapi.yaml#/components/responses/Error" };
const errors = Object.fromEntries([400, 401, 403, 404, 409, 413, 415, 429, 500, 503].map(code => [String(code), error]));
const key = { in: "header", name: "Idempotency-Key", required: true, schema: fromZod(keySchema) };
const id = { in: "path", name: "id", required: true, schema: ref("Id") };
const limit = { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } };
const cursor = { in: "query", name: "cursor", schema: { type: "string", maxLength: 2048 } };
const mode = { in: "query", name: "mode", schema: { type: "string", enum: ["gym", "calisthenics"] } };
function operation(operationId: string, response: ObjectSchema, parameters: unknown[] = [], input?: string, created = false, description?: string) {
  return { operationId, description, parameters: [...parameters, ...(input ? [key] : [])],
    ...(input ? { requestBody: { required: true, content: json(ref(input)) } } : {}),
    responses: { [created ? "201" : "200"]: { description: "Canonical account-owned state, or original successful response on exact idempotent replay.", content: json(response) }, ...errors } };
}
const paths: Record<string, Record<string, unknown>> = {
  "/me": {
    get: operation("getMe", ref("Account"), [], undefined, false, "Read identity, binary setup state, profile, training preferences, user preferences and all three versions without saving a draft."),
    patch: operation("patchMe", ref("AccountPatchResponse"), [], "AccountPatchInput", false,
      "One atomic PATCH for changed resources only. Include exactly their baseVersions. Omission preserves, nullable null clears, nested trainingContext merges; arrays replace. setupCompleted cannot be patched. Profile/training editor requires completed onboarding; budget/area preferences may be saved independently. Optional nutrition can remain unavailable. No query parameters."),
  },
  "/workouts": {
    get: operation("listWorkouts", ref("WorkoutList"), [{ in: "query", name: "from", schema: { type: "string", format: "date" } }, { in: "query", name: "to", schema: { type: "string", format: "date" } }, limit, { ...cursor, schema: { type: "string", maxLength: 256 } }], undefined, false, "Legacy bounded offset cursor for owned history; from <= to. New collection cursors below are separately signed and cannot be used here."),
    post: operation("recordCompletedWorkout", ref("CompletedWorkoutResponse"), [], "CompletedWorkoutInput", true, "Submit once after finishing: full performed exerciseSnapshot, complete setLog, startedAt, finishedAt and local recordedOn >=1900-01-01. Always creates status completed; no start, resume, per-set or abort API. Source custom/recommended requires programId with matching ownership/catalog and mode; source manual must omit programId. Only source manual accepts optional newExercises (even an empty array); at most12 unique account-local new IDs, every one referenced by exerciseSnapshot and mode matching the workout. Existing local IDs including tombstones or any catalog ID conflict409; another account's matching ID is independently scoped, never a private reference. All exercise rows, workout, sync events and one whole-response receipt commit atomically or fully roll back. Fresh responses include exercises with canonical fields/version strings, empty if none; pre-upgrade receipts may replay item-only JSON. Valid historical references may be soft-deleted/inactive. Server canonicalizes exercise labels/requirements but never rebuilds sets/reps from a program or current recommendations. Custom exercise requirements are unverified and use [[]]. Results remain self-reported, not proof that a program was recommended. Key retry replays without duplication, including new exercise IDs already committed on a lost ACK; changed payload/key reuse rejects409. finishedAt >= startedAt; recordedOn within one day of UTC start day."),
  },
  "/workouts/{id}": { parameters: [id], get: operation("getWorkout", ref("WorkoutResponse")), delete: operation("deleteWorkout", ref("Deleted"), [], "DeleteInput", false, "Soft-delete only, retaining immutable history payload; owner/version required.") },
  "/places/{id}/favorite": { parameters: [id], put: operation("addPlaceFavorite", ref("Favorite"), [], "DeleteInput", false, "Set favorite using favoriteVersion from GET /places as baseVersion. Active public place required when adding. Same-state requests do not bump versions."),
    delete: operation("removePlaceFavorite", ref("Favorite"), [], "DeleteInput", false, "Remove only this place. Tombstone favoriteVersion remains readable via GET /places for re-add; absence is version0.") },
  "/dashboard": { get: operation("getDashboard", ref("Dashboard"), [{ in: "query", name: "date", required: true, schema: fromZod(dashboardQuerySchema.shape.date) }], undefined, false, "Bounded current-page data only. No recommendation call. nutritionTargets and remaining are null when setup is incomplete; no SETUP_REQUIRED guard.") },
};
for (const path of ["/schedule", "/statistics"] as const) {
  paths[path] = { get: operation(path === "/schedule" ? "getSchedule" : "getStatistics", ref(path === "/schedule" ? "Schedule" : "Statistics"),
    ["from", "to"].map(name => ({ in: "query", name, required: true, schema: { type: "string", format: "date" } })), undefined, false,
    "Inclusive user-local date range with 0..366 days between endpoints. SQL summaries, not full history. Weekly custom schedule uses ISO Monday1..Sunday7. Statistics exclude demo meals/undated records and do not infer bodyweight load or calories burned. Figures are user-reported.") };
}
void summaryQuerySchema;
for (const [type, name] of Object.entries(resourceNames) as [keyof typeof resourceNames, string][]) {
  const data = resourceSchemas[type];
  schemas[`${name}Create`] = fromZod(z.object({ id: idSchema, data, ...(type === "custom_program" ? { newExercises: newExercisesSchema.optional() } : {}) }).strict());
  schemas[`${name}Patch`] = fromZod(z.object({ baseVersion: versionSchema, changes: z.object(data.shape as z.ZodRawShape).partial().strict(), ...(type === "custom_program" ? { newExercises: newExercisesSchema.optional() } : {}) }).strict());
  schemas[name] = type === "meal_entry" ? original("MealLogItem") : fromZod(z.object(data.shape as z.ZodRawShape).extend(meta));
  schemas[`${name}Response`] = object({ item: ref(name), ...(type === "custom_program" ? { exercises: array(ref("CustomExercise")) } : {}),
    ...(type === "meal_entry" ? { journals: array(ref("MealJournalSummary")) } : {}) }, ["item", ...(type === "meal_entry" ? ["journals"] : [])]);
  const path = { custom_program: "/programs/custom", user_exercise: "/exercises/custom", meal_entry: "/meals", social_draft: "/social/drafts" }[type];
  paths[path] = {
    get: type === "meal_entry" ? operation("listMeals", ref("MealList"), [{ in: "query", name: "date", required: true, schema: { type: "string", format: "date" } }, { ...limit, schema: { ...limit.schema, default: 50 } }, { in: "query", name: "offset", schema: { type: "integer", minimum: 0, maximum: 100000, default: 0 } }]) :
      operation(`list${name}`, object({ items: array(ref(name)), nextCursor: { type: ["string", "null"] } }), [limit, cursor, ...(["custom_program", "user_exercise"].includes(type) ? [mode] : [])], undefined, false,
        "Signed ID-keyset cursor bound to account, resource and mode filter. No disk cache or full-account bootstrap. Private draft list never publishes content."),
    post: operation(`create${name}`, ref(`${name}Response`), [], `${name}Create`, true,
      "Strict final create with client-generated stable ID; IDs (including deleted IDs) cannot be reused. Program may atomically create newExercises; exercise references must be owned or active catalog and support its mode. Exercise labels/requirements are server-canonical, not client-authoritative. Exercise mode is immutable. Meals resolve catalog nutrition/estimated price server-side; journal summaries returned. Drafts remain private."),
  };
  paths[`${path}/{id}`] = { parameters: [id],
    get: operation(`get${name}`, object({ item: ref(name) })),
    patch: operation(`patch${name}`, ref(`${name}Response`), [], `${name}Patch`, false,
      "Non-empty changed fields only; merge with persisted data before validation. Only declared nullable fields accept null. Preserve untouched metadata, nutrition/price snapshots and versions. Meal journals include both dates if moved. Program schedule slot conflicts return409; newExercises and program write are one transaction. History snapshots never change when program/exercise changes."),
    delete: operation(`delete${name}`, type === "meal_entry" ? { allOf: [ref("Deleted"), object({ journals: array(ref("MealJournalSummary")) })] } : ref("Deleted"), [], "DeleteInput", false, "Account-owned versioned soft-delete. Same successful key/body replays without another delete; new keys for absent/deleted rows return404."),
  };
}
console.log(JSON.stringify({ openapi: "3.1.0", info: { title: "MusMove direct online APIs", version: "1.1.0", description:
  "Source contract, not proof of deployment. Primary spec is openapi.yaml, which references these path items. Every mutation requires a UUID Idempotency-Key plus resource versions for updates/deletes. Scope/hash/receipt and domain writes commit atomically; same account/key/normalized body replays the original successful JSON/status, different content/path rejects409. Failed transactions save no receipt. No TTL cleanup/discovery endpoint, no skip endpoint, no new SETUP_REQUIRED recommendation guard. All ownership from Bearer JWT. JSON <=64KiB, depth32; mutation responses <=256KiB, reads <=3MiB. Account120/min and writes30/min;429 honors Retry-After; errors sanitized with requestId. Existing sync remains compatible. No new tables, cloud deployment, production personal writes or deletion of legacy device data." },
  servers: [{ url: "/api/v1" }], security: [{ bearerAuth: [] }], paths,
  components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } }, schemas } }, null, 2));
