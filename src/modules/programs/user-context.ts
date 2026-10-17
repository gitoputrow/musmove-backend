import type { Profile } from "@/src/db/schema";

/** Product rules for the adult, general-training catalog, not medical clearance. */
export function deriveUserContext(profile: Profile, equipmentItems: string[]) {
  const context = profile.trainingContext ?? {};
  const adjustments: string[] = [];
  const assumptions: string[] = [];
  const olderAdult = profile.ageYears !== null && profile.ageYears >= 65;
  const returning = (context.trainingBreakWeeks ?? 0) >= 4;
  const tired = context.recoveryStatus === "tired";
  const requiresSupport = context.balanceConfidence === "needs_support" ||
    (olderAdult && context.balanceConfidence !== "stable");
  if (olderAdult) adjustments.push("OLDER_ADULT_BALANCE_COMPONENT_RECOMMENDED");
  if (olderAdult && !context.balanceConfidence) assumptions.push("BALANCE_DEFAULTED_TO_SUPPORTED_MOVEMENTS");
  if (requiresSupport) adjustments.push("SUPPORTED_MOVEMENTS_REQUIRED");
  if (returning) adjustments.push("RETURN_TO_TRAINING_VOLUME_REDUCED");
  if (tired) adjustments.push("RECOVERY_VOLUME_REDUCED");
  if (!context.healthStatus || context.healthStatus === "prefer_not_to_say") assumptions.push("HEALTH_RESTRICTIONS_NOT_CONFIRMED");
  if (!context.pregnancyStatus || context.pregnancyStatus === "prefer_not_to_say") assumptions.push("PREGNANCY_CONTEXT_NOT_CONFIRMED");
  if (!profile.gender || profile.gender === "prefer_not_to_say") assumptions.push("GENDER_NOT_DISCLOSED");
  if (profile.weightKg === null) assumptions.push("BODYWEIGHT_NOT_PROVIDED");
  if (profile.heightCm === null && context.equipmentHeightLimits?.length) assumptions.push("HEIGHT_REQUIRED_FOR_EQUIPMENT_FIT");
  if (profile.exerciseCapabilities?.some((item) => item.mode === "calisthenics" && !bodyweightEvidenceStillApplies(profile.weightKg, item.bodyweightKg))) {
    adjustments.push("BODYWEIGHT_CHANGED_REASSESS_CAPABILITY");
  }
  const blockedEquipment = (context.equipmentHeightLimits ?? []).filter((item) =>
    equipmentItems.includes(item.equipment) &&
    (profile.heightCm === null || profile.heightCm < item.minHeightCm || profile.heightCm > item.maxHeightCm),
  ).map((item) => item.equipment);
  if (blockedEquipment.length) adjustments.push("EQUIPMENT_HEIGHT_FIT_FILTER_APPLIED");
  const forbiddenMovementTags = new Set<string>([
    ...(context.painAreas ?? []), ...(context.mobilityLimitations ?? []),
    ...(requiresSupport ? ["balance_challenge"] : []),
  ]);
  let reason: string | null = null;
  if (context.healthStatus === "needs_professional_guidance") reason = "PROFESSIONAL_GUIDANCE_REQUIRED";
  else if (context.pregnancyStatus === "pregnant" || context.pregnancyStatus === "postpartum") reason = "SPECIALIZED_PROGRAM_REQUIRED";
  else if (context.recoveryStatus === "very_tired") reason = "RECOVERY_REQUIRED";
  return {
    olderAdult, returning, tired, requiresSupport, adjustments, assumptions,
    equipment: equipmentItems.filter((item) => !blockedEquipment.includes(item)),
    blockedEquipment, forbiddenMovementTags, reason,
  };
}

export function bodyweightEvidenceStillApplies(
  currentWeightKg: number | null,
  assessedWeightKg: number | null | undefined,
) {
  if (!currentWeightKg || !assessedWeightKg || !Number.isFinite(assessedWeightKg) || assessedWeightKg <= 0) return true;
  // Deliberately conservative freshness heuristic, not an injury/BMI cutoff.
  return Math.abs(currentWeightKg - assessedWeightKg) / assessedWeightKg <= 0.05;
}
