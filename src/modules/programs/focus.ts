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

export interface ProgramUse { programId: string; finishedAt: Date; focus?: string }

// Only already-filtered, personalized candidates enter this planner. Prefer a
// standard session over a compact fallback, then vary by actual completion.
// Do not clone programs, add days, or mutate prescriptions to force coverage.
export function distributeFocusPrograms<T extends { id: string; focus: string; exercises?: { id: string }[] }>(
  programs: T[], focusAreas: FocusArea[], weeklySessions: number, history: ProgramUse[] = [],
) {
  const unique = [...new Map(programs.map(program => [program.id, program])).values()];
  const stats = (ids: Set<string>, focus?: string) => {
    const matching = history.filter(use => (focus !== undefined && use.focus !== undefined ? use.focus === focus : ids.has(use.programId)) && Number.isFinite(use.finishedAt.getTime()));
    return { count: matching.length, last: Math.max(0, ...matching.map(use => use.finishedAt.getTime())) };
  };
  const compareUse = (a: ReturnType<typeof stats>, b: ReturnType<typeof stats>) => a.count - b.count || a.last - b.last;
  const groups = focusAreas.map((area, index) => {
    const items = unique.filter(program => program.focus === area);
    return { area, index, items, usage: stats(new Set(items.map(p => p.id)), area) };
  });
  for (const group of groups) group.items.sort((a, b) => {
    const standard = (p: T) => (p.exercises?.length ?? 0) >= 3 ? 1 : 0;
    return standard(b) - standard(a) || compareUse(stats(new Set([a.id])), stats(new Set([b.id]))) || a.id.localeCompare(b.id, "en");
  });
  const priority = [...groups].sort((a, b) => compareUse(a.usage, b.usage) || a.index - b.index);
  const ordered: T[] = [];
  for (let index = 0; priority.some(group => index < group.items.length); index++) {
    for (const group of priority) if (group.items[index]) ordered.push(group.items[index]);
  }
  const selected = new Set<string>();
  const planned = new Map<FocusArea, number>();
  const weeklyPlan: { sessionNumber: number; programId: string; focus: string }[] = [];
  const limit = Number.isFinite(weeklySessions) ? Math.max(0, Math.min(7, Math.floor(weeklySessions))) : 0;
  while (weeklyPlan.length < limit) {
    const choices = priority.filter(group => group.items.some(program => !selected.has(program.id)))
      .sort((a, b) => (planned.get(a.area) ?? 0) - (planned.get(b.area) ?? 0) || compareUse(a.usage, b.usage) || a.index - b.index);
    const group = choices[0];
    if (!group) break;
    const program = group.items.find(item => !selected.has(item.id))!;
    selected.add(program.id); planned.set(group.area, (planned.get(group.area) ?? 0) + 1);
    weeklyPlan.push({ sessionNumber: weeklyPlan.length + 1, programId: program.id, focus: program.focus });
  }
  return { programs: ordered, weeklyPlan, focusCoverage: {
    requested: focusAreas,
    available: focusAreas.filter(area => ordered.some(program => program.focus === area)),
    unavailable: focusAreas.filter(area => !ordered.some(program => program.focus === area)),
    scheduled: focusAreas.filter(area => weeklyPlan.some(session => session.focus === area)),
    unscheduled: focusAreas.filter(area => !weeklyPlan.some(session => session.focus === area)),
    unfilledSessions: Math.max(0, limit - weeklyPlan.length),
  } };
}
