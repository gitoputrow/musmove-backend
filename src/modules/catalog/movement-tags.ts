// Shared vocabulary for conservative movement restrictions, not muscle targets
// or medical clearance. See docs/exercise-movement-tags.md for execution scope.
export const MOVEMENT_TAGS = [
  "shoulder", "elbow", "wrist", "back", "hip", "knee", "ankle",
  "floor_transfer", "overhead_reach", "deep_knee_bend", "balance_challenge",
] as const;

export type MovementTag = typeof MOVEMENT_TAGS[number];
const knownTags = new Set<string>(MOVEMENT_TAGS);

export function validMovementTags(value: unknown): value is MovementTag[] {
  return Array.isArray(value) && value.length > 0 && value.length <= MOVEMENT_TAGS.length
    && value.every((tag) => typeof tag === "string" && knownTags.has(tag))
    && new Set(value).size === value.length;
}
