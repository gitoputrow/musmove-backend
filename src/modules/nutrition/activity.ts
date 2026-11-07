import { z } from "zod";

// Session counts describe reported occurrences, not distinct days or energy expenditure.
export const activityRoutineSchema = z.object({
  dailyMovement: z.enum(["mostly_sitting", "walking_standing", "physical_work"]),
  sports: z.array(z.object({
    name: z.string().trim().min(1).max(50).refine(value => !Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127), "Control characters are not allowed"),
    sessionsPerWeek: z.number().int().min(1).max(7),
  }).strict()).max(7).refine(items => new Set(items.map(item => item.name.toLocaleLowerCase("en-US"))).size === items.length, "Duplicate sport names"),
}).strict();
export type ActivityRoutine = z.infer<typeof activityRoutineSchema>;

export function activityFromRoutine(routine: ActivityRoutine) {
  const reportedSessions = routine.sports.reduce((total, sport) => total + sport.sessionsPerWeek, 0);
  // A cap is not deduplication: multiple sports may occur on the same day.
  const cappedSessions = Math.min(reportedSessions, 7);
  const band = cappedSessions <= 1 ? 0 : cappedSessions <= 3 ? 1 : cappedSessions <= 5 ? 2 : 3;
  const factors = {
    mostly_sitting: [1.2, 1.375, 1.55, 1.725],
    walking_standing: [1.375, 1.55, 1.725, 1.9],
    physical_work: [1.55, 1.725, 1.9, null],
  } as const;
  return { factor: factors[routine.dailyMovement][band], reportedSessions, cappedSessions,
    method: "weekly_sessions_heuristic_v1" as const };
}
