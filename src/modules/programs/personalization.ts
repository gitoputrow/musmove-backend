import type { ExerciseCapability, ExercisePrescription, Profile, WorkoutSession } from "@/src/db/schema";
import { bodyweightEvidenceStillApplies, deriveUserContext } from "./user-context";
import { validMovementTags } from "@/src/modules/catalog/movement-tags";

export interface ProgramTemplate {
  id: string;
  name: string;
  mode: "gym" | "calisthenics";
  focus: string;
  durationMinutes: number;
  exercises: ExercisePrescription[];
}

export interface CatalogExercise {
  id: string;
  mode: "gym" | "calisthenics";
  idLabel: string;
  enLabel: string;
  requirements: string[][];
  movementTags?: string[] | null;
}

export function normalizeGoal(value: string | null) {
  switch (value) {
    case "bulk": case "muscle": return "muscle";
    case "cut": case "fat": return "fat_loss";
    case "fit": case "maintain": case "maintenance": return "general_fitness";
    case "strength": return "strength";
    case "endurance": return "endurance";
    default: return "general_fitness";
  }
}

const supportedGoals = new Set(["bulk", "muscle", "cut", "fat", "fit", "maintain", "maintenance", "strength", "endurance"]);
const regressions: Record<string, string[]> = {
  pushup: ["knee_pushup", "wall_pushup"],
  diamond: ["pushup", "knee_pushup", "wall_pushup"],
  pullup: ["band_assisted_pullup"],
  squat: ["chair_sit_to_stand"],
  lunge: ["supported_reverse_lunge"],
};

function hasEquipment(exercise: CatalogExercise, equipment: Set<string>) {
  return exercise.requirements.some((group) => group.every((item) => equipment.has(item)));
}

// Recent logs are evidence at a particular load, not a strength/max-effort test.
// Never increase weight automatically, and never infer ability from sex/BMI.
function recentPerformance(exercise: CatalogExercise, history: WorkoutSession[], profile: Profile) {
  for (const session of history) {
    if (session.mode !== exercise.mode) continue;
    const reportedBodyweight = session.legacyMetadata?.bodyweightKg;
    if (exercise.mode === "calisthenics" && typeof reportedBodyweight === "number" &&
      !bodyweightEvidenceStillApplies(profile.weightKg, reportedBodyweight)) continue;
    const snapshot = session.exerciseSnapshot.find((item) => item.id === exercise.id);
    if (!snapshot) continue;
    const logs = session.setLog.filter((entry) => entry.exerciseId === exercise.id);
    if (logs.length !== snapshot.sets || logs.some((entry) => !entry.completed || entry.reps === null)) continue;
    const weights = new Set(logs.map((entry) => entry.weightKg));
    if (weights.size !== 1) continue;
    return { reps: Math.min(...logs.map((entry) => entry.reps!)), weightKg: logs[0].weightKg };
  }
  return null;
}

export function personalizePrograms(
  templates: ProgramTemplate[],
  catalog: CatalogExercise[],
  profile: Profile,
  equipmentItems: string[],
  history: WorkoutSession[],
) {
  const level = profile.trainingLevel ?? "beginner";
  const goal = normalizeGoal(profile.goal);
  const userContext = deriveUserContext(profile, equipmentItems);
  const frequencyCap = userContext.returning ? 2 : level === "beginner" ? 2 : level === "intermediate" ? 3 : 4;
  const weeklySessions = Math.min(profile.trainingFrequency ?? 2, frequencyCap);
  const baseSets = userContext.returning ? 2 : level === "beginner" ? 2 : goal === "muscle" && level === "advanced" ? 4 : 3;
  const sets = userContext.tired ? Math.max(1, baseSets - 1) : baseSets;
  const goalReps = goal === "strength" ? 6 : goal === "endurance" ? 12 : goal === "muscle" || goal === "fat_loss" ? 10 : 8;
  const baseRestSeconds = goal === "strength" ? 120 : goal === "muscle" ? 90 : 60;
  const restSeconds = Math.max(baseRestSeconds, userContext.returning || userContext.olderAdult ? 90 : 0) + (userContext.tired ? 30 : 0);
  const excluded = new Set(profile.excludedExerciseIds ?? []);
  const equipment = new Set(userContext.equipment);
  const assumptions: string[] = [...userContext.assumptions];
  if (!profile.trainingLevel) assumptions.push("TRAINING_LEVEL_DEFAULTED_TO_BEGINNER");
  if (!profile.goal || !supportedGoals.has(profile.goal)) assumptions.push("GOAL_DEFAULTED_TO_GENERAL_FITNESS");
  if (!profile.ageYears) assumptions.push("AGE_NOT_PROVIDED");
  if (!profile.exerciseCapabilities?.length && !history.length) assumptions.push("NO_ABILITY_ASSESSMENT_OR_RECENT_HISTORY");

  const personalization = {
    algorithmVersion: "2",
    trainingLevel: level,
    goal,
    requestedWeeklySessions: profile.trainingFrequency,
    suggestedWeeklySessions: weeklySessions,
    assumptions,
    // formulaSex is the existing nutrition-formula field, not gender identity.
    profileContext: {
      ageYears: profile.ageYears, formulaSex: profile.formulaSex,
      weightKg: profile.weightKg, heightCm: profile.heightCm,
      dailyActivity: profile.dailyActivity,
      gender: profile.gender,
      trainingContext: profile.trainingContext,
    },
    contextAdjustments: userContext.adjustments,
    blockedEquipment: userContext.blockedEquipment,
    genderPolicy: "NO_STRENGTH_INFERENCE_FROM_GENDER_OR_FORMULA_SEX",
    balanceComponentRecommended: userContext.olderAdult,
    bodyweightEvidencePolicy: "REASSESS_IF_BODYWEIGHT_CHANGED_MORE_THAN_5_PERCENT",
    excludedExerciseIds: [...excluded],
    loadPolicy: "REUSE_RECENT_CONFIRMED_LOAD_OR_SELF_ASSESSMENT_NO_AUTOMATIC_INCREASE",
  };

  if (profile.ageYears === null) {
    return { programs: [], personalization, reason: "AGE_REQUIRED", rejectedPrograms: [] };
  }
  if (profile.ageYears < 18) {
    return { programs: [], personalization, reason: "ADULT_PROGRAMS_ONLY", rejectedPrograms: [] };
  }
  if (userContext.reason) {
    return { programs: [], personalization, reason: userContext.reason, rejectedPrograms: [] };
  }

  const rejectedPrograms: { programId: string; reason: string; exerciseId?: string }[] = [];
  const programs = templates.flatMap((template) => {
    const prescriptions: ExercisePrescription[] = [];
    const adjustments: { originalExerciseId: string; exerciseId: string; source: string }[] = [];
    for (const original of template.exercises) {
      const candidates = [original.id, ...(regressions[original.id] ?? [])];
      let selected: { exercise: CatalogExercise; reps: number; weightKg: number | null; source: string } | undefined;
      for (const candidateId of candidates) {
        if (excluded.has(candidateId) || prescriptions.some((item) => item.id === candidateId)) continue;
        const exercise = catalog.find((item) => item.id === candidateId && item.mode === template.mode);
        if (!exercise || !hasEquipment(exercise, equipment)) continue;
        if (userContext.forbiddenMovementTags.size &&
          (!validMovementTags(exercise.movementTags) || exercise.movementTags.some((tag) => userContext.forbiddenMovementTags.has(tag)))) continue;
        const ability: ExerciseCapability | undefined = profile.exerciseCapabilities?.find((item) => item.exerciseId === candidateId && item.mode === template.mode);
        const performance = recentPerformance(exercise, history, profile);
        // More recent training is useful, but a self-declared inability always wins.
        if (ability?.maxReps === 0) continue;
        if (ability && template.mode === "calisthenics" &&
          !bodyweightEvidenceStillApplies(profile.weightKg, ability.bodyweightKg)) continue;
        const difficultBodyweight = template.mode === "calisthenics" && ["pushup", "diamond", "pullup", "knee_pushup"].includes(candidateId);
        if (level === "beginner" && difficultBodyweight && !ability && !performance) continue;
        const abilityReps = ability ? Math.floor(ability.maxReps * 0.8) : null;
        if (abilityReps !== null && abilityReps < 3) continue;
        // Assessment and historical reps cannot be mixed across different loads.
        const performanceAtSameLoad = performance && (!ability || performance.weightKg === ability.weightKg) ? performance : null;
        const reps = Math.min(
          goalReps,
          abilityReps ?? goalReps,
          performanceAtSameLoad?.reps ?? goalReps,
          userContext.returning || userContext.tired ? 8 : goalReps,
          !ability && !performance && level === "beginner" ? 8 : goalReps,
        );
        if (reps < 3) continue;
        const weightKg = ability ? ability.weightKg : performance?.weightKg ?? null;
        selected = { exercise, reps, weightKg,
          source: ability ? "SELF_ASSESSMENT" : performance ? "RECENT_WORKOUT" : "CONSERVATIVE_START" };
        break;
      }
      if (!selected) {
        rejectedPrograms.push({ programId: template.id, reason: "EXERCISE_ABILITY_OR_EQUIPMENT_UNAVAILABLE", exerciseId: original.id });
        return [];
      }
      prescriptions.push({
        id: selected.exercise.id, idLabel: selected.exercise.idLabel,
        enLabel: selected.exercise.enLabel,
        sets: userContext.olderAdult && selected.source === "CONSERVATIVE_START" ? Math.min(sets, 2) : sets,
        reps: selected.reps,
        targetWeightKg: selected.weightKg, requirements: selected.exercise.requirements,
      });
      adjustments.push({ originalExerciseId: original.id, exerciseId: selected.exercise.id, source: selected.source });
    }

    // Explainable planning estimate: 5-minute warmup, 3 sec/rep, 30 sec setup,
    // plus rest between sets. No claim of exact physiological timing.
    const estimatedMinutes = Math.ceil((300 + prescriptions.reduce((total, exercise) => total +
      exercise.sets * exercise.reps * 3 + (exercise.sets - 1) * restSeconds + 30, 0)) / 60);
    if (estimatedMinutes > (profile.sessionMinutes ?? 20)) {
      rejectedPrograms.push({ programId: template.id, reason: "SESSION_DURATION_EXCEEDED" });
      return [];
    }
    return [{ ...template, durationMinutes: estimatedMinutes, exercises: prescriptions,
      restSeconds, suggestedWeeklySessions: weeklySessions, adjustments }];
  });
  return { programs, personalization, rejectedPrograms, reason: programs.length ? null : "NO_MATCHING_PROGRAM" };
}
