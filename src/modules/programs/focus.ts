import { z } from "zod";

// Order is canonical, not a ranking or training priority.
export const focusOrder = ["full", "leg", "chest", "back", "arm"] as const;
export const focusSchema = z.enum(focusOrder);
export type FocusArea = z.infer<typeof focusSchema>;
export const focusAreasSchema = z.array(focusSchema).max(4).superRefine((areas, ctx) => {
  if (new Set(areas).size !== areas.length) ctx.addIssue({ code: "custom", message: "Duplicate focus areas" });
  if (areas.includes("full") && areas.length !== 1) ctx.addIssue({ code: "custom", message: "full must be selected alone" });
});

type FocusFields = { focus?: unknown; focusAreas?: unknown };
export function readFocusAreas(profile: FocusFields): FocusArea[] {
  // An existing array is authoritative, including []; never resurrect a stale string.
  if (profile.focusAreas !== undefined && profile.focusAreas !== null) {
    const parsed = focusAreasSchema.safeParse(profile.focusAreas);
    return parsed.success ? focusOrder.filter(area => parsed.data.includes(area)) : [];
  }
  const legacy = focusSchema.safeParse(profile.focus);
  return legacy.success ? [legacy.data] : [];
}

export function resolveFocusFields(input: FocusFields, current: FocusFields = {}) {
  const focusAreas = input.focusAreas !== undefined ? readFocusAreas(input) :
    input.focus !== undefined ? readFocusAreas({ focus: input.focus }) : readFocusAreas(current);
  return { focusAreas, focus: focusAreas.length === 1 ? focusAreas[0] : null };
}

// Apply only to raw request fields, not a server-projected multi profile (focus:null).
export function validateFocusPair(input: FocusFields, ctx: z.RefinementCtx) {
  if (input.focusAreas === undefined || input.focus === undefined) return;
  const areas = readFocusAreas(input);
  const consistent = input.focus === null ? areas.length === 0 : areas.length === 1 && areas[0] === input.focus;
  if (!consistent) ctx.addIssue({ code: "custom", path: ["focusAreas"], message: "focus and focusAreas conflict; send focusAreas only for multiple selections" });
}

// Interleave alternatives without cloning programs or changing their volume.
// weeklyPlan is a bounded suggestion, not a saved schedule or extra training days.
export function distributeFocusPrograms<T extends { id: string; focus: string }>(programs: T[], focusAreas: FocusArea[], weeklySessions: number) {
  const unique = [...new Map(programs.map(program => [program.id, program])).values()];
  const groups = focusAreas.map(area => unique.filter(program => program.focus === area));
  const ordered: T[] = [];
  for (let index = 0; groups.some(group => index < group.length); index++) {
    for (const group of groups) if (group[index]) ordered.push(group[index]);
  }
  const weeklyPlan = ordered.slice(0, weeklySessions).map((program, index) => ({ sessionNumber: index + 1, programId: program.id, focus: program.focus }));
  return { programs: ordered, weeklyPlan, focusCoverage: {
    requested: focusAreas,
    available: focusAreas.filter(area => ordered.some(program => program.focus === area)),
    unavailable: focusAreas.filter(area => !ordered.some(program => program.focus === area)),
    scheduled: focusAreas.filter(area => weeklyPlan.some(session => session.focus === area)),
    unscheduled: focusAreas.filter(area => !weeklyPlan.some(session => session.focus === area)),
    unfilledSessions: Math.max(0, weeklySessions - weeklyPlan.length),
  } };
}
