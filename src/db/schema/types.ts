export type JsonPrimitive = boolean | number | string | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export interface ExerciseCapability {
  exerciseId: string;
  mode: "gym" | "calisthenics";
  maxReps: number | null;
  trackingType?: "repetitions" | "duration";
  maxDurationSeconds?: number | null;
  weightKg: number | null;
  bodyweightKg?: number | null;
}

export interface TrainingContext {
  pregnancyStatus?: "not_applicable" | "not_pregnant" | "pregnant" | "postpartum" | "prefer_not_to_say" | null;
  healthStatus?: "no_known_restrictions" | "needs_professional_guidance" | "prefer_not_to_say" | null;
  painAreas?: ("shoulder" | "elbow" | "wrist" | "back" | "hip" | "knee" | "ankle")[];
  mobilityLimitations?: ("floor_transfer" | "overhead_reach" | "deep_knee_bend")[];
  balanceConfidence?: "stable" | "needs_support" | null;
  recoveryStatus?: "recovered" | "tired" | "very_tired" | null;
  trainingBreakWeeks?: number | null;
  equipmentHeightLimits?: { equipment: string; minHeightCm: number; maxHeightCm: number }[];
}

export type ExercisePrescription = JsonObject & {
  id: string;
  idLabel: string;
  enLabel: string;
  sets: number;
  reps: number | null;
  targetWeightKg: number | null;
  requirements: string[][];
  trackingType?: "repetitions" | "duration";
  targetDurationSeconds?: number | null;
  muscleTargets?: import("@/src/modules/workouts/measurement").MuscleTargets | null;
}

export type WorkoutExercisePrescription = ExercisePrescription & {
  // Absent on legacy/program snapshots; required throughout explicit manual ones.
  mode?: "gym" | "calisthenics";
}

export type WorkoutSetLog = JsonObject & {
  exerciseId: string;
  setNumber: number;
  completed: boolean;
  reps: number | null;
  weightKg: number | null;
  exerciseMode?: "gym" | "calisthenics";
  durationSeconds?: number | null;
}
