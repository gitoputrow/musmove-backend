import type { ExercisePrescription } from "@/src/db/schema/types";
import { badRequest } from "@/src/lib/api-error";
import type { MuscleTargets } from "./measurement";

export function canonicalMeasurement(prescription: ExercisePrescription, reference: { trackingType?: string; muscleTargets?: MuscleTargets | null }) {
  const trackingType = reference.trackingType ?? "repetitions";
  if ((prescription.trackingType ?? "repetitions") !== trackingType) throw badRequest("TRACKING_TYPE_MISMATCH", "Prescription trackingType must match the referenced exercise");
  return { ...prescription, trackingType: trackingType as "repetitions" | "duration",
    muscleTargets: reference.muscleTargets ?? null };
}
