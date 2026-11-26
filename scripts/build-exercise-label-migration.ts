// Offline generator. The reviewed bilingual mapping is the source of truth;
// never infer or rewrite movement names at request time.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const data = JSON.parse(readFileSync("src/db/data/exercise-labels-2026-11-25.json", "utf8"));
interface Label {
  mode: string; id: string; requirements: string[][];
  previousIdLabel: string; previousEnLabel: string; idLabel: string; enLabel: string;
}
const exercises = data.exercises as Label[];
assert.equal(exercises.length, 143);
assert.equal(new Set(exercises.map(e => `${e.mode}:${e.id}`)).size, exercises.length);
for (const exercise of exercises) {
  assert.ok(["gym", "calisthenics"].includes(exercise.mode));
  for (const name of [exercise.idLabel, exercise.enLabel]) {
    assert.ok(name.length <= 80 && name === name.trim());
    assert.match(name, /^.+ \([^()]+\)$/);
  }
  assert.ok(exercise.requirements.length > 0);
}
const payload = JSON.stringify(exercises.map(e => ({
  mode: e.mode, id: e.id, requirements: e.requirements,
  previous_id_label: e.previousIdLabel, previous_en_label: e.previousEnLabel,
  id_label: e.idLabel, en_label: e.enLabel,
})), null, 2);
assert.ok(!payload.includes("$exercise_labels$"));
writeFileSync("drizzle/0038_standardize_exercise_labels.sql", `-- Reviewed exercise names: movement followed by the primary equipment in parentheses.
-- Preserve stable (mode,id), requirements, defaults, muscles, movement tags and active flags.
-- Never rewrite account exercises, saved programs, workout snapshots, logs or receipts.
DO $label_migration$
DECLARE
  labels jsonb := $exercise_labels$
${payload}
$exercise_labels$::jsonb;
BEGIN
  -- Abort on drift instead of partially renaming or misclassifying an edited catalog.
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(labels) AS seed (
      mode text, id text, requirements jsonb, previous_id_label text, previous_en_label text, id_label text, en_label text
    ) LEFT JOIN exercise_catalog AS exercise ON exercise.mode::text = seed.mode AND exercise.id = seed.id
    WHERE exercise.id IS NULL OR exercise.requirements IS DISTINCT FROM seed.requirements
      OR ((exercise.id_label, exercise.en_label) IS DISTINCT FROM (seed.previous_id_label, seed.previous_en_label)
        AND (exercise.id_label, exercise.en_label) IS DISTINCT FROM (seed.id_label, seed.en_label))
  ) THEN
    RAISE EXCEPTION 'Exercise label mapping does not match the current catalog; review the mapping before migrating';
  END IF;

  -- Avoid firing the statement-level catalog version trigger on an unchanged rerun.
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(labels) AS seed (mode text, id text, id_label text, en_label text)
    JOIN exercise_catalog AS exercise ON exercise.mode::text = seed.mode AND exercise.id = seed.id
    WHERE (exercise.id_label, exercise.en_label) IS DISTINCT FROM (seed.id_label, seed.en_label)
  ) THEN
    UPDATE exercise_catalog AS exercise
    SET id_label = seed.id_label, en_label = seed.en_label, updated_at = now()
    FROM jsonb_to_recordset(labels) AS seed (mode text, id text, id_label text, en_label text)
    WHERE exercise.mode::text = seed.mode AND exercise.id = seed.id
      AND (exercise.id_label, exercise.en_label) IS DISTINCT FROM (seed.id_label, seed.en_label);
  END IF;
END
$label_migration$;
`);
console.info(`Generated label migration for ${exercises.length} exercise identities`);
