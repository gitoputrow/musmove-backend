import { and, asc, eq } from "drizzle-orm";
import { getDatabase } from "@/src/db/client";
import { catalogState, equipmentCatalog, exerciseCatalog } from "@/src/db/schema";
import { badRequest } from "@/src/lib/api-error";
import { matchesEquipmentCategory, matchesMuscleTargets, type ExerciseQuery } from "./exercise-query";

export async function getExerciseCatalog(query: ExerciseQuery = {}) {
  return getDatabase().transaction(async (transaction) => {
    const [state] = await transaction.select({ version: catalogState.version })
      .from(catalogState).where(eq(catalogState.name, "exercises"));
    if (!state) throw new Error("Exercise catalog migration has not been applied");
    if (query.equipmentIds) {
      const equipment = await transaction.select({ id: equipmentCatalog.id }).from(equipmentCatalog).where(eq(equipmentCatalog.active, true));
      const known = new Set(equipment.map(item => item.id));
      if (query.equipmentIds.some(id => !known.has(id))) throw badRequest("UNKNOWN_EQUIPMENT", "Use active IDs from the equipment catalog");
    }
    const rows = await transaction.select({
      id: exerciseCatalog.id,
      mode: exerciseCatalog.mode,
      idLabel: exerciseCatalog.idLabel,
      enLabel: exerciseCatalog.enLabel,
      defaultSets: exerciseCatalog.defaultSets,
      defaultReps: exerciseCatalog.defaultReps,
      trackingType: exerciseCatalog.trackingType,
      defaultDurationSeconds: exerciseCatalog.defaultDurationSeconds,
      muscleTargets: exerciseCatalog.muscleTargets,
      requirements: exerciseCatalog.requirements,
    }).from(exerciseCatalog).where(and(eq(exerciseCatalog.active, true), query.mode ? eq(exerciseCatalog.mode, query.mode) : undefined))
      .orderBy(asc(exerciseCatalog.mode), asc(exerciseCatalog.id));
    const ids = query.equipmentIds && new Set(query.equipmentIds);
    const exercises = rows.filter(row => matchesEquipmentCategory(row.requirements, query.equipment) && matchesMuscleTargets(row.muscleTargets, query) &&
      (!ids || row.requirements.some(group => group.some(id => ids.has(id)))));
    return { catalogVersion: state.version.toString(), exercises };
  }, { accessMode: "read only", isolationLevel: "repeatable read" });
}
