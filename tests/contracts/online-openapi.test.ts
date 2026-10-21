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
  assert.equal(spec.components.schemas.CompletedWorkoutResponse.properties.exercises.items.$ref, "#/components/schemas/CustomExercise");
  assert.equal(spec.components.schemas.Dashboard.properties.activeWorkout, undefined);
});
