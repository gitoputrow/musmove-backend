import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";

test("Online OpenAPI artifact matches current DTO generator and all path items are linked from the main spec", () => {
  const generated = execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/export-online-openapi.ts"], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  const artifact = readFileSync("docs/openapi-online.json", "utf8");
  assert.equal(artifact.trim(), generated.trim(), "Regenerate the OpenAPI artifact after DTO changes");
  const spec = JSON.parse(artifact), yaml = readFileSync("docs/openapi.yaml", "utf8");
  const ids = new Set<string>();
  for (const [path, methods] of Object.entries(spec.paths) as [string, Record<string, { operationId?: string }> ][]) {
    assert.ok(yaml.includes(`./openapi-online.json#/paths/${path.replaceAll("/", "~1")}`), `Main spec missing ${path}`);
    const localRoute = `app/api/v1${path.replaceAll("{id}", "[id]")}/route.ts`;
    assert.ok(existsSync(localRoute), `No source route for ${path}`);
    for (const operation of Object.values(methods)) {
      if (!operation.operationId) continue;
      assert.ok(!ids.has(operation.operationId)); ids.add(operation.operationId);
    }
  }
  assert.ok(ids.size >= 30);
  for (const path of ["/workouts/active", "/workouts/manual", "/workouts/{id}/sets", "/workouts/{id}/complete", "/workouts/{id}/abort"]) {
    assert.equal(spec.paths[path], undefined);
    assert.equal(existsSync(`app/api/v1${path.replaceAll("{id}", "[id]")}/route.ts`), false);
  }
  assert.equal(spec.paths["/workouts"].post.operationId, "recordCompletedWorkout");
  assert.equal(spec.paths["/workouts"].post.responses["201"].content["application/json"].schema.$ref, "#/components/schemas/CompletedWorkoutResponse");
  assert.equal(spec.components.schemas.CompletedWorkoutInput.properties.newExercises.maxItems, 12);
  assert.ok(!spec.components.schemas.CompletedWorkoutInput.required.includes("newExercises"));
  assert.equal(spec.components.schemas.CompletedWorkoutInput.allOf[0].then.properties.source.const, "manual");
  assert.ok(!spec.components.schemas.CompletedWorkoutInput.required.includes("mode"));
  assert.equal(spec.components.schemas.CompletedWorkoutInput.oneOf.length, 2);
  assert.deepEqual(spec.components.schemas.CompletedWorkoutInput.oneOf[1].properties.exerciseSnapshot.items.required, ["mode"]);
  assert.deepEqual(spec.components.schemas.Workout.properties.mode.enum, ["gym", "calisthenics", "mixed"]);
  assert.deepEqual(spec.paths["/workouts"].get.parameters.find((p: { name: string }) => p.name === "mode").schema.enum, ["gym", "calisthenics", "mixed"]);
  assert.equal(spec.components.schemas.ExercisePrescription.properties.mode, undefined);
  assert.deepEqual(spec.components.schemas.ExercisePrescription.properties.trackingType.enum, ["repetitions", "duration"]);
  assert.equal(spec.components.schemas.ExercisePrescription.allOf[0].then.properties.reps.type, "null");
  assert.equal(spec.components.schemas.Workout.properties.resultMetrics.readOnly, true);
  assert.equal(spec.components.schemas.CompletedWorkoutInput.properties.resultMetrics, undefined);
  assert.equal(spec.components.schemas.CompletedWorkoutInput.properties.energyActivityCode, undefined);
  assert.equal(spec.components.schemas.CompletedWorkoutInput.properties.workoutBodyweightKg, undefined);
  assert.ok(spec.components.schemas.CompletedWorkoutInput.properties.sessionTiming);
  assert.equal(spec.components.schemas.CurrentWorkoutResultMetrics.properties.version.const, "2");
  assert.equal(spec.components.schemas.CurrentWorkoutResultMetrics.properties.energy, undefined);
  assert.ok(spec.components.schemas.CurrentWorkoutResultMetrics.properties.duration);
  assert.ok(spec.components.schemas.CurrentWorkoutResultMetrics.properties.muscles);
  assert.equal(spec.components.schemas.LegacyWorkoutResultMetrics.deprecated, true);
  assert.deepEqual(spec.components.schemas.WorkoutResultMetrics.oneOf, [
    { $ref: "#/components/schemas/CurrentWorkoutResultMetrics" }, { $ref: "#/components/schemas/LegacyWorkoutResultMetrics" },
  ]);
  assert.equal(spec.components.schemas.CompletedWorkoutInput.properties.setLog.items.properties.durationSeconds.anyOf.find((s: { type: string }) => s.type === "integer").maximum, 3600);
  assert.deepEqual(spec.components.schemas.Statistics.properties.totals.properties.reportedExternalVolumeKg.type, ["number", "null"]);
  assert.equal(spec.components.schemas.CompletedWorkoutResponse.properties.exercises.items.$ref, "#/components/schemas/CustomExercise");
  assert.equal(spec.components.schemas.Dashboard.properties.activeWorkout, undefined);
  const profile = spec.components.schemas.AccountPatchInput.properties.profile;
  assert.equal(profile.properties.focusAreas.$ref, "./openapi.yaml#/components/schemas/FocusAreas");
  assert.equal(profile.allOf[0].$ref, "./openapi.yaml#/components/schemas/FocusInputCompatibility");
  assert.ok(!profile.required?.includes("focusAreas"));
  for (const schema of ["FocusAreas", "FocusInputCompatibility", "FocusCoverage"]) assert.ok(yaml.includes(`    ${schema}:`));
  assert.ok(yaml.includes("weeklyPlan:"));
});
