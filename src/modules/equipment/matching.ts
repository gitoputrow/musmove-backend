export interface EquipmentItem { id: string; name: string; aliases: string[] }
export interface EquipmentExercise {
  id: string; mode: "gym" | "calisthenics"; idLabel: string; enLabel: string;
  defaultSets: number; defaultReps: number; requirements: string[][];
}

export function normalizeEquipmentName(value: string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

export function searchEquipment(items: EquipmentItem[], query?: string) {
  if (query === undefined) return { matchType: "catalog" as const, equipment: items };
  const normalized = normalizeEquipmentName(query);
  if (!normalized) return { matchType: "no_match" as const, equipment: [] };
  const labels = (item: EquipmentItem) => [item.id, item.name, ...item.aliases].map(normalizeEquipmentName);
  const exact = items.filter((item) => labels(item).includes(normalized));
  if (exact.length) return { matchType: exact.length === 1 ? "exact" as const : "candidates" as const, equipment: exact };
  const matches = items.filter((item) => labels(item).some((label) => label.includes(normalized)));
  return { matchType: matches.length ? "candidates" as const : "no_match" as const, equipment: matches };
}

// Each inner array is an AND group; outer arrays are alternatives (OR).
// Similar-looking machines are not interchangeable, and optional mats must not
// become an invented mandatory requirement for all bodyweight exercises.
export function matchEquipmentExercises(exercises: EquipmentExercise[], equipmentIds: string[]) {
  const available = new Set(equipmentIds);
  const ready: (EquipmentExercise & { missingEquipmentOptions: string[][] })[] = [];
  const needsMoreEquipment: typeof ready = [];
  for (const exercise of exercises) {
    if (!exercise.requirements.some((group) => group.some((id) => available.has(id)))) continue;
    const options = exercise.requirements.map((group) => [...new Set(group.filter((id) => !available.has(id)))].sort());
    const distinct = [...new Map(options.map((option) => [JSON.stringify(option), option])).values()];
    const minimal = distinct.filter((option) => !distinct.some((other) => other.length < option.length && other.every((id) => option.includes(id))));
    const complete = minimal.some((option) => option.length === 0);
    const item = { ...exercise, missingEquipmentOptions: complete ? [] : minimal };
    (complete ? ready : needsMoreEquipment).push(item);
  }
  return { ready, needsMoreEquipment };
}
