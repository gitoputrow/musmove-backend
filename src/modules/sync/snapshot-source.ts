import { sql } from "drizzle-orm";
import type { EntityType } from "./dto";

// Explicit projection: never copy internal ownership/derived/private columns.
const sources: { type: EntityType; table: string; id: string; fields: string[] }[] = [
  { type: "profile", table: "profiles", id: "'profile'", fields: ["display_name", "age_years", "weight_kg", "height_cm", "formula_sex", "gender", "training_context", "goal", "motivation_reason", "motivation_enabled", "daily_activity", "training_frequency", "focus", "focus_areas", "program_source", "session_minutes", "setup_completed", "training_level", "exercise_capabilities", "excluded_exercise_ids"] },
  { type: "training_preferences", table: "training_preferences", id: "'training_preferences'", fields: ["mode", "equipment", "no_equipment"] },
  { type: "custom_program", table: "custom_programs", id: "id", fields: ["mode", "name", "duration_minutes", "weekday", "exercise_prescriptions"] },
  { type: "user_exercise", table: "user_exercises", id: "id", fields: ["mode", "name", "default_sets", "default_reps", "tracking_type", "default_duration_seconds"] },
  { type: "workout_session", table: "workout_sessions", id: "id", fields: ["plan_id", "mode", "status", "started_at", "finished_at", "recorded_on", "exercise_snapshot", "set_log", "legacy_metadata", "result_metrics"] },
  { type: "user_preferences", table: "user_preferences", id: "'user_preferences'", fields: ["budget_rupiah", "budget_is_manual", "places_area"] },
  { type: "place_favorite", table: "place_favorites", id: "place_id", fields: [] },
  { type: "meal_entry", table: "meal_entries", id: "id", fields: ["note", "menu_name", "sample_price_rupiah", "snapshot", "catalog_id", "servings", "consumed_at", "recorded_on", "meal_type", "nutrition_per_serving"] },
  { type: "social_draft", table: "social_drafts", id: "id", fields: ["body", "metadata"] },
  { type: "legacy_user_metadata", table: "legacy_user_metadata", id: "'legacy_user_metadata'", fields: ["joined_ids", "metadata"] },
];

export function snapshotSource(userId: string) {
  return sql.join(sources.map(source => {
    const pairs = source.fields.flatMap(field => [
      sql`${field === "nutrition_per_serving" ? "nutrition" : field.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}::text`,
      source.type === "profile" && field === "focus" ? sql`CASE WHEN cardinality(focus_areas) = 1 THEN focus_areas[1] ELSE NULL END` : sql`${sql.identifier(field)}`,
    ]);
    const payload = pairs.length ? sql`jsonb_build_object(${sql.join(pairs, sql`, `)})` : sql`'{}'::jsonb`;
    return sql`SELECT ${source.type}::text AS entity_type, ${sql.raw(source.id)}::text AS entity_id,
      version, updated_at, ${payload} AS payload FROM ${sql.identifier(source.table)}
      WHERE user_id=${userId} AND deleted_at IS NULL`;
  }), sql` UNION ALL `);
}
