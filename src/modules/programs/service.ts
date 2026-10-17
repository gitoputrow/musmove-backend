import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { getDatabase } from "@/src/db/client";
import { catalogState, exerciseCatalog, profiles, trainingPreferences, workoutProgramCatalog, workoutProgramExercises, workoutSessions } from "@/src/db/schema";
import { conflict } from "@/src/lib/api-error";
import { personalizePrograms } from "./personalization";

export interface ProgramPreferences {
  mode: "gym" | "calisthenics";
  focus: string;
  sessionMinutes: number;
  equipment: string[];
}

export function matchesProgram(
  program: { mode: string; focus: string; durationMinutes: number; exercises: { requirements: string[][] }[] },
  preferences: ProgramPreferences,
) {
  const equipment = new Set(preferences.equipment);
  return program.mode === preferences.mode && program.focus === preferences.focus &&
    program.durationMinutes <= preferences.sessionMinutes && program.exercises.length > 0 &&
    program.exercises.every((exercise) => exercise.requirements.some((group) => group.every((item) => equipment.has(item))));
}

export async function getProgramCatalog(userId?: string) {
  return getDatabase().transaction(async (transaction) => {
    const states = await transaction.select().from(catalogState);
    const templates = await transaction.select().from(workoutProgramCatalog)
      .where(eq(workoutProgramCatalog.active, true)).orderBy(asc(workoutProgramCatalog.id));
    const entries = await transaction.select({
      programId: workoutProgramExercises.programId,
      position: workoutProgramExercises.position,
      id: exerciseCatalog.id,
      idLabel: exerciseCatalog.idLabel,
      enLabel: exerciseCatalog.enLabel,
      sets: workoutProgramExercises.sets,
      reps: workoutProgramExercises.reps,
      requirements: exerciseCatalog.requirements,
      active: exerciseCatalog.active,
    }).from(workoutProgramExercises).innerJoin(exerciseCatalog, and(
      eq(workoutProgramExercises.mode, exerciseCatalog.mode),
      eq(workoutProgramExercises.exerciseId, exerciseCatalog.id),
    )).orderBy(asc(workoutProgramExercises.position));
    const programs = templates.flatMap((template) => {
      const items = entries.filter((entry) => entry.programId === template.id);
      if (!items.length || items.some((entry) => !entry.active)) return [];
      return [{
        id: template.id,
        name: template.name,
        mode: template.mode,
        focus: template.focus,
        durationMinutes: template.durationMinutes,
        exercises: items.map((entry) => ({
          id: entry.id, idLabel: entry.idLabel, enLabel: entry.enLabel,
          sets: entry.sets, reps: entry.reps, targetWeightKg: null as number | null,
          requirements: entry.requirements,
        })),
      }];
    });
    const versions = {
      catalogVersion: states.find((state) => state.name === "programs")?.version.toString(),
      exerciseCatalogVersion: states.find((state) => state.name === "exercises")?.version.toString(),
    };
    if (!versions.catalogVersion) throw new Error("Program catalog migration has not been applied");
    if (!userId) return { ...versions, programs };

    const [profile] = await transaction.select().from(profiles).where(and(eq(profiles.userId, userId), isNull(profiles.deletedAt)));
    const [training] = await transaction.select().from(trainingPreferences).where(and(eq(trainingPreferences.userId, userId), isNull(trainingPreferences.deletedAt)));
    if (!profile || !training || !profile.focus || !profile.sessionMinutes) {
      throw conflict("PREFERENCES_REQUIRED", "Save training preferences, focus and sessionMinutes through sync before requesting programs");
    }
    if (!["full", "leg", "chest", "back", "arm"].includes(profile.focus)) {
      throw conflict("UNSUPPORTED_FOCUS", "Supported focus values: full, leg, chest, back, arm");
    }
    const preferences: ProgramPreferences = {
      mode: training.mode, focus: profile.focus,
      sessionMinutes: profile.sessionMinutes,
      equipment: training.noEquipment ? [] : training.equipment,
    };
    const catalog = await transaction.select().from(exerciseCatalog).where(eq(exerciseCatalog.active, true));
    const history = await transaction.select().from(workoutSessions).where(and(
      eq(workoutSessions.userId, userId), eq(workoutSessions.mode, training.mode),
      eq(workoutSessions.status, "completed"), isNull(workoutSessions.deletedAt),
      gte(workoutSessions.finishedAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
      lte(workoutSessions.finishedAt, new Date()),
    )).orderBy(desc(workoutSessions.finishedAt), desc(workoutSessions.id)).limit(20);
    const candidates = programs.filter((program) => program.mode === training.mode && program.focus === profile.focus);
    const personalized = personalizePrograms(candidates, catalog, profile, preferences.equipment, history);
    return { ...versions, preferences, ...personalized };
  }, { accessMode: "read only", isolationLevel: "repeatable read" });
}
