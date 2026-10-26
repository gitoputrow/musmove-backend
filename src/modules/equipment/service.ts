import { and, asc, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/src/db/client";
import { catalogState, equipmentCatalog, exerciseCatalog } from "@/src/db/schema";
import { badRequest } from "@/src/lib/api-error";
import { matchEquipmentExercises, searchEquipment } from "./matching";

export async function getEquipmentCatalog(query?: string, mode?: "gym" | "calisthenics") {
  return getDatabase().transaction(async (tx) => {
    const [state] = await tx.select().from(catalogState).where(eq(catalogState.name, "equipment"));
    if (!state) throw new Error("Equipment catalog migration has not been applied");
    const rows = await tx.select({ id: equipmentCatalog.id, name: equipmentCatalog.name, aliases: equipmentCatalog.aliases, modes: equipmentCatalog.modes })
      .from(equipmentCatalog).where(and(eq(equipmentCatalog.active, true), mode ? sql`${equipmentCatalog.modes} @> ARRAY[${mode}]::text[]` : undefined))
      .orderBy(asc(equipmentCatalog.name), asc(equipmentCatalog.id));
    return { catalogVersion: state.version.toString(), ...searchEquipment(rows, query) };
  }, { accessMode: "read only", isolationLevel: "repeatable read" });
}

export async function getEquipmentExercises(ids: string[], mode?: "gym" | "calisthenics") {
  return getDatabase().transaction(async (tx) => {
    const equipment = await tx.select({ id: equipmentCatalog.id, name: equipmentCatalog.name, aliases: equipmentCatalog.aliases, modes: equipmentCatalog.modes })
      .from(equipmentCatalog).where(eq(equipmentCatalog.active, true));
    const known = new Set(equipment.map((item) => item.id));
    if (ids.some((id) => !known.has(id))) throw badRequest("UNKNOWN_EQUIPMENT", "Use active IDs from the equipment catalog");
    const states = await tx.select().from(catalogState);
    const equipmentVersion = states.find((s) => s.name === "equipment")?.version;
    const exerciseVersion = states.find((s) => s.name === "exercises")?.version;
    if (!equipmentVersion || !exerciseVersion) throw new Error("Catalog migrations have not been applied");
    const rows = await tx.select({
      id: exerciseCatalog.id, mode: exerciseCatalog.mode, idLabel: exerciseCatalog.idLabel,
      enLabel: exerciseCatalog.enLabel, defaultSets: exerciseCatalog.defaultSets,
      defaultReps: exerciseCatalog.defaultReps, requirements: exerciseCatalog.requirements,
      trackingType: exerciseCatalog.trackingType, defaultDurationSeconds: exerciseCatalog.defaultDurationSeconds, muscleTargets: exerciseCatalog.muscleTargets,
    }).from(exerciseCatalog).where(and(eq(exerciseCatalog.active, true), mode ? eq(exerciseCatalog.mode, mode) : undefined))
      .orderBy(asc(exerciseCatalog.enLabel), asc(exerciseCatalog.mode), asc(exerciseCatalog.id));
    const supported = rows.filter((row) => row.requirements.every((group) => group.every((id) => known.has(id))));
    return {
      equipmentCatalogVersion: equipmentVersion.toString(), exerciseCatalogVersion: exerciseVersion.toString(),
      selectedEquipment: ids.map((id) => equipment.find((item) => item.id === id)!),
      ...matchEquipmentExercises(supported, ids),
      warnings: ["EQUIPMENT_MATCH_IS_NOT_PERSONALIZED_WORKOUT_ADVICE"],
    };
  }, { accessMode: "read only", isolationLevel: "repeatable read" });
}
