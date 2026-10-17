import { asc, eq } from "drizzle-orm";
import { getDatabase } from "@/src/db/client";
import { catalogState, exerciseCatalog } from "@/src/db/schema";

export async function getExerciseCatalog() {
  return getDatabase().transaction(async (transaction) => {
    const [state] = await transaction.select({ version: catalogState.version })
      .from(catalogState).where(eq(catalogState.name, "exercises"));
    if (!state) throw new Error("Exercise catalog migration has not been applied");
    const exercises = await transaction.select({
      id: exerciseCatalog.id,
      mode: exerciseCatalog.mode,
      idLabel: exerciseCatalog.idLabel,
      enLabel: exerciseCatalog.enLabel,
      defaultSets: exerciseCatalog.defaultSets,
      defaultReps: exerciseCatalog.defaultReps,
      requirements: exerciseCatalog.requirements,
    }).from(exerciseCatalog).where(eq(exerciseCatalog.active, true))
      .orderBy(asc(exerciseCatalog.mode), asc(exerciseCatalog.id));
    return { catalogVersion: state.version.toString(), exercises };
  }, { accessMode: "read only", isolationLevel: "repeatable read" });
}
