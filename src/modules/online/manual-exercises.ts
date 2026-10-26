import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { exerciseCatalog, userExercises } from "@/src/db/schema";
import type { DatabaseTransaction } from "@/src/modules/sync/entities";
import { workoutExerciseSchema } from "@/src/modules/sync/dto";
import { badRequest } from "@/src/lib/api-error";
import { canonicalMeasurement } from "@/src/modules/workouts/canonical-measurement";

// Deliberately separate from canonicalExercises: programs stay single-mode.
export async function canonicalManualExercises(tx: DatabaseTransaction, userId: string, input: unknown) {
  const exercises = z.array(workoutExerciseSchema.safeExtend({ mode: z.enum(["gym", "calisthenics"]) })).min(1).max(12).parse(input);
  return Promise.all(exercises.map(async prescription => {
    const [catalog] = await tx.select().from(exerciseCatalog).where(and(
      eq(exerciseCatalog.id, prescription.id), eq(exerciseCatalog.mode, prescription.mode),
    ));
    const [custom] = await tx.select().from(userExercises).where(and(
      eq(userExercises.userId, userId), eq(userExercises.id, prescription.id), eq(userExercises.mode, prescription.mode),
    ));
    // Old sync data could contain a local ID shadowing a public one. Never guess
    // which reference a new explicit manual snapshot means; foreign rows ignored.
    if (catalog && custom) throw badRequest("AMBIGUOUS_EXERCISE_REFERENCE", "This exercise ID and mode have ambiguous references; choose a different exercise ID");
    if (catalog) return { ...canonicalMeasurement(prescription, catalog), mode: prescription.mode, idLabel: catalog.idLabel, enLabel: catalog.enLabel, requirements: catalog.requirements };
    if (!custom) throw badRequest("EXERCISE_NOT_AVAILABLE", "Exercise not found in the catalog or this account for its declared mode");
    // Historical references remain valid even if deactivated/soft-deleted while
    // training. These are performed snapshots, not current selection permission.
    return { ...canonicalMeasurement(prescription, custom), mode: prescription.mode, idLabel: custom.name, enLabel: custom.name, requirements: [[]] };
  }));
}
