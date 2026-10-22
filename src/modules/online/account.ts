import { and, eq, inArray, sql } from "drizzle-orm";
import { equipmentCatalog } from "@/src/db/schema";
import { badRequest } from "@/src/lib/api-error";
import { readAccountSetup } from "@/src/modules/onboarding/service";
import { readNutritionTargets } from "@/src/modules/nutrition/storage";
import { completeOnboardingSchema } from "@/src/modules/onboarding/dto";
import { entityPayloadSchemas } from "@/src/modules/sync/dto";
import type { z } from "zod";
import { accountPatchSchema } from "./dto";
import { expectVersion, mutateOnline, payloadOf, readItem } from "./store";
import type { DatabaseTransaction } from "@/src/modules/sync/entities";
import { resolveFocusFields } from "@/src/modules/programs/focus";

export async function validateEquipment(tx: DatabaseTransaction, training: unknown) {
  const value = completeOnboardingSchema.shape.trainingPreferences.parse(training);
  if (value.equipment.length) {
    const rows = await tx.select({ id: equipmentCatalog.id }).from(equipmentCatalog).where(and(
      eq(equipmentCatalog.active, true), inArray(equipmentCatalog.id, value.equipment),
      sql`${equipmentCatalog.modes} @> ARRAY[${value.mode}]::text[]`,
    ));
    if (rows.length !== value.equipment.length) throw badRequest("EQUIPMENT_NOT_AVAILABLE_FOR_MODE", "Choose active equipment supported by the selected mode");
  }
  return value;
}

export function patchAccount(userId: string, key: string, input: z.infer<typeof accountPatchSchema>) {
  return mutateOnline(userId, key, "account.patch", input, async ctx => {
    const profile = await readItem(ctx.tx, userId, "profile", "profile");
    const training = await readItem(ctx.tx, userId, "training_preferences", "training_preferences");
    const preferences = await readItem(ctx.tx, userId, "user_preferences", "user_preferences");
    const liveProfile = profile && !profile.deletedAt ? payloadOf(profile) : {};
    const liveTraining = training && !training.deletedAt ? payloadOf(training) : {};
    // Do not allow this editor to persist partial onboarding answers or create
    // default profiles on skipped accounts. Only complete finalizes first setup.
    if ((input.profile || input.trainingPreferences) && !liveProfile.setupCompleted) {
      throw badRequest("ONBOARDING_NOT_COMPLETED", "Submit initial setup through onboarding/complete; this endpoint edits an existing completed profile");
    }
    for (const [name, row] of [["profile", profile], ["trainingPreferences", training], ["userPreferences", preferences]] as const) {
      if (input[name]) expectVersion(row, input.baseVersions[name]!);
    }
    const merged = { ...liveProfile, ...input.profile, ...resolveFocusFields(input.profile ?? {}, liveProfile), setupCompleted: liveProfile.setupCompleted === true };
    if (input.profile?.trainingContext !== undefined) merged.trainingContext = input.profile.trainingContext === null ? null : {
      ...(liveProfile.trainingContext as object ?? {}), ...input.profile.trainingContext,
    };
    const chosenTraining = { ...liveTraining, ...input.trainingPreferences };
    // Validate related profile/training state together, even if only one changes.
    if (input.profile || input.trainingPreferences) {
      // Do not turn an unrelated edit into re-onboarding of a legacy completed
      // profile. Validate focus when the user actually edits source/focus.
      if (input.profile && ["focus", "focusAreas", "programSource"].some(field => Object.hasOwn(input.profile!, field)) &&
        merged.programSource === "app" && !merged.focusAreas.length) {
        throw badRequest("FOCUS_REQUIRED", "Choose focus areas for app-generated programs");
      }
      if (input.trainingPreferences) await validateEquipment(ctx.tx, chosenTraining);
      if (input.profile) await ctx.put("profile", "profile", input.baseVersions.profile!, entityPayloadSchemas.profile.parse(merged));
      if (input.trainingPreferences) await ctx.put("training_preferences", "training_preferences", input.baseVersions.trainingPreferences!, chosenTraining);
    }
    if (input.userPreferences) {
      const current = preferences && !preferences.deletedAt ? payloadOf(preferences) : { budgetRupiah: null, budgetIsManual: false, placesArea: null };
      const next = entityPayloadSchemas.user_preferences.parse({ ...current, ...input.userPreferences });
      if (next.budgetIsManual && next.budgetRupiah === null) throw badRequest("BUDGET_REQUIRED", "Manual budget requires a positive budgetRupiah");
      await ctx.put("user_preferences", "user_preferences", input.baseVersions.userPreferences!, next);
    }
    return { ...await readAccountSetup(ctx.tx, userId), nutritionTargets: await readNutritionTargets(ctx.tx, userId) };
  });
}
