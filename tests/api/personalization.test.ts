import assert from "node:assert/strict";
import { test } from "node:test";
import type { Profile, WorkoutSession } from "../../src/db/schema";
import { personalizePrograms, type CatalogExercise, type ProgramTemplate } from "../../src/modules/programs/personalization";
import { entityPayloadSchemas } from "../../src/modules/sync/dto";
import { reviewedMovementTags } from "../fixtures/reviewed-movement-tags";

const catalog: CatalogExercise[] = [
  { id: "pushup", mode: "calisthenics", idLabel: "Push-up", enLabel: "Push-up", requirements: [[]], movementTags: ["shoulder", "wrist", "floor_transfer"] },
  { id: "knee_pushup", mode: "calisthenics", idLabel: "Push-up lutut", enLabel: "Knee push-up", requirements: [[]], movementTags: ["shoulder", "wrist", "knee", "floor_transfer"] },
  { id: "wall_pushup", mode: "calisthenics", idLabel: "Push-up dinding", enLabel: "Wall push-up", requirements: [[]], movementTags: ["shoulder", "wrist"] },
  { id: "press", mode: "gym", idLabel: "Press", enLabel: "Press", requirements: [["dumbbell"]], movementTags: ["shoulder", "wrist", "floor_transfer"] },
];
const template: ProgramTemplate = {
  id: "test", mode: "calisthenics", name: "Test", focus: "chest", durationMinutes: 20,
  exercises: [{ ...catalog[0], sets: 3, reps: 10, targetWeightKg: null }],
};
const gymTemplate: ProgramTemplate = { ...template, mode: "gym", exercises: [{ ...catalog[3], sets: 3, reps: 10, targetWeightKg: null }] };

test("duration prescriptions use seconds and duration assessments, never rep history or fabricated reps", () => {
  const timed: CatalogExercise = { id: "plank", mode: "gym", idLabel: "Plank", enLabel: "Plank", requirements: [[]], trackingType: "duration", movementTags: ["floor_transfer"] };
  const plan: ProgramTemplate = { ...gymTemplate, exercises: [{ id: "plank", idLabel: "Plank", enLabel: "Plank", requirements: [[]], sets: 1, reps: null, trackingType: "duration", targetDurationSeconds: 30, targetWeightKg: null }] };
  const one = personalizePrograms([plan], [timed], profile({ trainingLevel: "beginner" }), [], []);
  assert.equal(one.programs[0].exercises[0].reps, null); assert.equal(one.programs[0].exercises[0].targetDurationSeconds, 20);
  const assessed = personalizePrograms([plan], [timed], profile({ exerciseCapabilities: [{ exerciseId: "plank", mode: "gym", trackingType: "duration", maxReps: null, maxDurationSeconds: 10, weightKg: null }] }), [], []);
  assert.equal(assessed.programs[0].exercises[0].targetDurationSeconds, 8);
  const blocked = personalizePrograms([plan], [timed], profile({ exerciseCapabilities: [{ exerciseId: "plank", mode: "gym", trackingType: "duration", maxReps: null, maxDurationSeconds: 0, weightKg: null }] }), [], []);
  assert.deepEqual(blocked.programs, []);
});

test("invalid or empty movement tags cannot bypass explicit movement restrictions", () => {
  for (const movementTags of [[], ["sholder"], ["wrist", "wrist"], null, undefined]) {
    const malformed = catalog.map((item) => ({ ...item, movementTags }));
    const result = personalizePrograms([template], malformed, profile({ trainingLevel: "advanced", trainingContext: { painAreas: ["shoulder"] } }), [], []);
    assert.equal(result.programs.length, 0);
  }
});

test("reviewed real-catalog tags distinguish floor, overhead, knee and support restrictions", () => {
  const realCatalog: CatalogExercise[] = reviewedMovementTags.map((item) => ({
    id: item.id, mode: item.mode, idLabel: item.id, enLabel: item.id,
    requirements: item.id === "chair_sit_to_stand" ? [["chair"]] : [[]], movementTags: item.tags,
  }));
  function one(id: string, mode: "gym" | "calisthenics" = "gym"): ProgramTemplate {
    return { id: `test-${id}`, name: id, mode, focus: "full", durationMinutes: 20,
      exercises: [{ id, idLabel: id, enLabel: id, sets: 2, reps: 8, targetWeightKg: null, requirements: [[]] }] };
  }
  const floor = profile({ trainingLevel: "advanced", trainingContext: { mobilityLimitations: ["floor_transfer"] } });
  assert.equal(personalizePrograms([one("press")], realCatalog, floor, [], []).programs.length, 0);
  assert.equal(personalizePrograms([one("bench_press")], realCatalog, floor, [], []).programs.length, 1);
  const overhead = profile({ trainingLevel: "advanced", trainingContext: { mobilityLimitations: ["overhead_reach"] } });
  assert.equal(personalizePrograms([one("lat_pulldown")], realCatalog, overhead, [], []).programs.length, 0);
  assert.equal(personalizePrograms([one("raise")], realCatalog, overhead, [], []).programs.length, 1);
  const knee = profile({ trainingLevel: "advanced", trainingContext: { painAreas: ["knee"] } });
  assert.equal(personalizePrograms([one("leg_extension")], realCatalog, knee, [], []).programs.length, 0);
  assert.equal(personalizePrograms([one("hammer_curl")], realCatalog, knee, [], []).programs.length, 1);
  const supported = profile({ ageYears: 70, trainingLevel: "advanced", trainingContext: { balanceConfidence: "needs_support" } });
  const program = personalizePrograms([one("squat", "calisthenics")], realCatalog, supported, ["chair"], []).programs[0];
  assert.equal(program.exercises[0].id, "chair_sit_to_stand");
});

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    userId: "test", version: BigInt(1), updatedAt: new Date(), deletedAt: null,
    displayName: null, ageYears: 30, weightKg: null, heightCm: null,
    formulaSex: null, gender: null, trainingContext: null, goal: "muscle", motivationReason: null, motivationEnabled: true,
    dailyActivity: null, trainingFrequency: 3, focus: "chest", focusAreas: ["chest"], programSource: "app",
    sessionMinutes: 45, setupCompleted: true, trainingLevel: null,
    exerciseCapabilities: null, excludedExerciseIds: null, ...overrides,
  };
}

test("unknown beginner regresses push-up and exposes assumptions", () => {
  const result = personalizePrograms([template], catalog, profile(), [], []);
  assert.equal(result.programs[0].exercises[0].id, "wall_pushup");
  assert.equal(result.programs[0].exercises[0].sets, 2);
  assert.equal(result.programs[0].exercises[0].targetWeightKg, null);
  assert.ok(result.personalization.assumptions.includes("TRAINING_LEVEL_DEFAULTED_TO_BEGINNER"));
});

test("missing level stays missing in storage but three requested sessions remain possible with conservative prescriptions", () => {
  const input = profile({ trainingFrequency: 3, trainingLevel: null });
  const result = personalizePrograms([gymTemplate], catalog, input, ["dumbbell"], []);
  assert.equal(input.trainingLevel, null);
  assert.equal(result.personalization.trainingLevel, "beginner");
  assert.equal(result.personalization.trainingLevelSource, "CONSERVATIVE_DEFAULT");
  assert.deepEqual(result.personalization.missingProfileFields, ["trainingLevel"]);
  assert.equal(result.personalization.suggestedWeeklySessions, 3);
  assert.equal(result.personalization.algorithmVersion, "3");
  assert.equal(result.programs[0].exercises[0].sets, 2); assert.equal(result.programs[0].exercises[0].reps, 8);
  assert.equal(result.programs[0].exercises[0].targetWeightKg, null);
  const explicit = personalizePrograms([gymTemplate], catalog, profile({ trainingLevel: "beginner", trainingFrequency: 7 }), ["dumbbell"], []);
  assert.equal(explicit.personalization.suggestedWeeklySessions, 3);
  assert.equal(explicit.personalization.trainingLevelSource, "PROFILE");
  assert.deepEqual(explicit.personalization.missingProfileFields, []);
  assert.ok(explicit.personalization.assumptions.includes("TRAINING_FREQUENCY_CAPPED"));
});

test("goals adjust prescription and gender does not invent ability", () => {
  const base = profile({ trainingLevel: "advanced", goal: "strength", formulaSex: "female" });
  const female = personalizePrograms([gymTemplate], catalog, base, ["dumbbell"], []).programs[0];
  const male = personalizePrograms([gymTemplate], catalog, { ...base, formulaSex: "male" }, ["dumbbell"], []).programs[0];
  assert.deepEqual(female, male);
  assert.equal(female.exercises[0].reps, 6);
  assert.equal(female.restSeconds, 120);
  const muscle = personalizePrograms([gymTemplate], catalog, { ...base, goal: "bulk" }, ["dumbbell"], []).programs[0];
  assert.equal(muscle.exercises[0].sets, 4);
  assert.equal(muscle.exercises[0].reps, 10);
});

test("canonical maintenance goal matches maintain without a defaulted-goal warning", () => {
  const run = (goal: string) => personalizePrograms([gymTemplate], catalog, profile({ trainingLevel: "advanced", goal }), ["dumbbell"], []);
  const canonical = run("maintenance"), legacy = run("maintain");
  assert.deepEqual(canonical.programs, legacy.programs);
  assert.ok(!canonical.personalization.assumptions.includes("GOAL_DEFAULTED_TO_GENERAL_FITNESS"));
});

test("assessed ability caps reps and reuses only assessed load", () => {
  const result = personalizePrograms([gymTemplate], catalog, profile({
    trainingLevel: "intermediate",
    exerciseCapabilities: [{ mode: "gym", exerciseId: "press", maxReps: 5, weightKg: 4 }],
  }), ["dumbbell"], []);
  assert.equal(result.programs[0].exercises[0].reps, 4);
  assert.equal(result.programs[0].exercises[0].targetWeightKg, 4);
});

test("explicit inability and exclusions override experience", () => {
  const result = personalizePrograms([template], catalog, profile({
    trainingLevel: "advanced", excludedExerciseIds: ["knee_pushup"],
    exerciseCapabilities: [{ mode: "calisthenics", exerciseId: "pushup", maxReps: 0, weightKg: null }],
  }), [], []);
  assert.equal(result.programs[0].exercises[0].id, "wall_pushup");
});

test("equipment, time, age and excluded exercises gate selection", () => {
  assert.equal(personalizePrograms([gymTemplate], catalog, profile(), [], []).programs.length, 0);
  assert.equal(personalizePrograms([gymTemplate], catalog, profile({ trainingLevel: "advanced", sessionMinutes: 5 }), ["dumbbell"], []).programs.length, 0);
  assert.equal(personalizePrograms([template], catalog, profile({ ageYears: 15 }), [], []).reason, "ADULT_PROGRAMS_ONLY");
  assert.equal(personalizePrograms([template], catalog, profile({ ageYears: null }), [], []).reason, "AGE_REQUIRED");
  assert.equal(personalizePrograms([template], catalog, profile({ excludedExerciseIds: ["pushup", "knee_pushup", "wall_pushup"] }), [], []).programs.length, 0);
});

test("workout performance reuses load without automatic increases", () => {
  const history: WorkoutSession = {
    userId: "test", id: "session", planId: "test", mode: "gym", status: "completed",
    startedAt: new Date(), finishedAt: new Date(), recordedOn: null,
    exerciseSnapshot: gymTemplate.exercises,
    setLog: [1, 2, 3].map((setNumber) => ({ exerciseId: "press", setNumber, completed: true, reps: 7, weightKg: 6 })),
    legacyMetadata: null, resultMetrics: null, version: BigInt(1), updatedAt: new Date(), deletedAt: null,
  };
  const result = personalizePrograms([gymTemplate], catalog, profile({ trainingLevel: "intermediate" }), ["dumbbell"], [history]);
  assert.equal(result.programs[0].exercises[0].targetWeightKg, 6);
  assert.equal(result.programs[0].exercises[0].reps, 7);
  const assessed = personalizePrograms([gymTemplate], catalog, profile({
    exerciseCapabilities: [{ mode: "gym", exerciseId: "press", maxReps: 10, weightKg: 2 }],
  }), ["dumbbell"], [history]);
  assert.equal(assessed.programs[0].exercises[0].targetWeightKg, 2);
});

test("older adults receive supported leg movements without guessing strength", () => {
  const legCatalog: CatalogExercise[] = [
    { id: "squat", mode: "calisthenics", idLabel: "Squat", enLabel: "Squat", requirements: [[]], movementTags: ["balance_challenge", "knee"] },
    { id: "chair_sit_to_stand", mode: "calisthenics", idLabel: "Chair sit-to-stand", enLabel: "Chair sit-to-stand", requirements: [["chair"]], movementTags: ["knee"] },
  ];
  const legTemplate: ProgramTemplate = { ...template, focus: "leg", exercises: [{ ...legCatalog[0], sets: 3, reps: 10, targetWeightKg: null }] };
  const older = personalizePrograms([legTemplate], legCatalog, profile({ ageYears: 70, trainingLevel: "advanced" }), ["chair"], []);
  assert.equal(older.programs[0].exercises[0].id, "chair_sit_to_stand");
  assert.equal(older.programs[0].exercises[0].sets, 2);
  assert.equal(older.personalization.balanceComponentRecommended, true);
  const assessed = personalizePrograms([legTemplate], legCatalog, profile({ ageYears: 70, trainingLevel: "advanced", trainingContext: { balanceConfidence: "stable" }, exerciseCapabilities: [{ exerciseId: "squat", mode: "calisthenics", maxReps: 20, weightKg: null }] }), [], []);
  assert.equal(assessed.programs[0].exercises[0].id, "squat");
  assert.equal(assessed.programs[0].exercises[0].sets, 4);
});

test("pain and mobility restrictions filter reviewed movements", () => {
  const floorLimited = personalizePrograms([template], catalog, profile({ trainingLevel: "advanced", trainingContext: { mobilityLimitations: ["floor_transfer"] } }), [], []);
  assert.equal(floorLimited.programs[0].exercises[0].id, "wall_pushup");
  const shoulderPain = personalizePrograms([template], catalog, profile({ trainingContext: { painAreas: ["shoulder"] } }), [], []);
  assert.equal(shoulderPain.programs.length, 0);
  const unreviewed = personalizePrograms([template], catalog.map((item) => ({ ...item, movementTags: null })), profile({ trainingContext: { painAreas: ["shoulder"] } }), [], []);
  assert.equal(unreviewed.programs.length, 0);
});

test("recovery and a training break reduce workload or suspend templates", () => {
  const returning = personalizePrograms([gymTemplate], catalog, profile({ trainingLevel: "advanced", trainingContext: { trainingBreakWeeks: 8, recoveryStatus: "tired" } }), ["dumbbell"], []);
  assert.equal(returning.programs[0].exercises[0].sets, 1);
  assert.equal(returning.programs[0].exercises[0].reps, 8);
  assert.equal(returning.programs[0].restSeconds, 120);
  assert.equal(returning.personalization.suggestedWeeklySessions, 2);
  const exhausted = personalizePrograms([template], catalog, profile({ trainingContext: { recoveryStatus: "very_tired" } }), [], []);
  assert.equal(exhausted.reason, "RECOVERY_REQUIRED");
});

test("pregnancy and professional guidance status are independent of gender", () => {
  for (const gender of ["female", "male", "non_binary", "prefer_not_to_say"]) {
    const result = personalizePrograms([template], catalog, profile({ gender, trainingContext: { pregnancyStatus: "pregnant" } }), [], []);
    assert.equal(result.reason, "SPECIALIZED_PROGRAM_REQUIRED");
    assert.equal(result.programs.length, 0);
  }
  assert.equal(personalizePrograms([template], catalog, profile({ trainingContext: { healthStatus: "needs_professional_guidance" } }), [], []).reason, "PROFESSIONAL_GUIDANCE_REQUIRED");
  const male = personalizePrograms([template], catalog, profile({ gender: "male" }), [], []);
  const female = personalizePrograms([template], catalog, profile({ gender: "female" }), [], []);
  assert.deepEqual(male.programs, female.programs);
  assert.equal(female.personalization.profileContext.gender, "female");
});

test("height checks use declared equipment size limits rather than guessed ranges", () => {
  const machineCatalog: CatalogExercise[] = [{ ...catalog[3], id: "chest_press_machine", requirements: [["chest_press_machine"]] }];
  const machineTemplate: ProgramTemplate = { ...gymTemplate, exercises: [{ ...machineCatalog[0], sets: 3, reps: 10, targetWeightKg: null }] };
  const trainingContext = { equipmentHeightLimits: [{ equipment: "chest_press_machine", minHeightCm: 150, maxHeightCm: 200 }] };
  const short = personalizePrograms([machineTemplate], machineCatalog, profile({ heightCm: 140, trainingContext }), ["chest_press_machine"], []);
  assert.equal(short.programs.length, 0);
  assert.deepEqual(short.personalization.blockedEquipment, ["chest_press_machine"]);
  const fits = personalizePrograms([machineTemplate], machineCatalog, profile({ heightCm: 170, trainingContext }), ["chest_press_machine"], []);
  assert.equal(fits.programs.length, 1);
});

test("changed bodyweight invalidates old bodyweight capability evidence", () => {
  const changed = personalizePrograms([template], catalog, profile({ weightKg: 90, trainingLevel: "advanced", exerciseCapabilities: [{ exerciseId: "pushup", mode: "calisthenics", maxReps: 20, weightKg: null, bodyweightKg: 70 }] }), [], []);
  assert.notEqual(changed.programs[0].exercises[0].id, "pushup");
  const unchanged = personalizePrograms([template], catalog, profile({ weightKg: 72, trainingLevel: "advanced", exerciseCapabilities: [{ exerciseId: "pushup", mode: "calisthenics", maxReps: 20, weightKg: null, bodyweightKg: 70 }] }), [], []);
  assert.equal(unchanged.programs[0].exercises[0].id, "pushup");
});

test("new profile fields validate values and malformed equipment limits", () => {
  assert.equal(entityPayloadSchemas.profile.safeParse({ gender: "female", trainingContext: { recoveryStatus: "tired" } }).success, true);
  assert.equal(entityPayloadSchemas.profile.safeParse({ gender: "invalid" }).success, false);
  assert.equal(entityPayloadSchemas.profile.safeParse({ trainingContext: { trainingBreakWeeks: -1 } }).success, false);
  assert.equal(entityPayloadSchemas.profile.safeParse({ trainingContext: { equipmentHeightLimits: [{ equipment: "bench", minHeightCm: 200, maxHeightCm: 150 }] } }).success, false);
});
