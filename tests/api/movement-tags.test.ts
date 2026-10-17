import assert from "node:assert/strict";
import test from "node:test";
import { MOVEMENT_TAGS, validMovementTags } from "../../src/modules/catalog/movement-tags";
import { reviewedMovementTags } from "../fixtures/reviewed-movement-tags";

function tags(mode: "gym" | "calisthenics", id: string) {
  const row = reviewedMovementTags.find((r) => r.mode === mode && r.id === id);
  assert.ok(row, `Missing explicit annotation: ${mode}/${id}`);
  return row.tags;
}

test("117 explicit unique annotations, all using nonempty known tags", () => {
  assert.equal(reviewedMovementTags.length, 117);
  assert.equal(new Set(reviewedMovementTags.map((r) => `${r.mode}/${r.id}`)).size, 117);
  assert.equal(reviewedMovementTags.filter((r) => r.mode === "gym").length, 88);
  assert.equal(reviewedMovementTags.filter((r) => r.mode === "calisthenics").length, 29);
  assert.ok(reviewedMovementTags.every((r) => validMovementTags(r.tags)));
  assert.equal(MOVEMENT_TAGS.length, 11);
});

test("floor transfers are not confused with bench or seated machine setup", () => {
  for (const id of ["press", "barbell_floor_press", "dumbbell_floor_fly", "dumbbell_renegade_row", "hip_thrust", "dead_bug"]) {
    assert.ok(tags("gym", id).includes("floor_transfer"));
  }
  for (const id of ["bench_press", "flat_dumbbell_bench_press", "dumbbell_fly", "barbell_pullover", "seated_chest_press_machine", "lat_pulldown", "leg_press", "deadlift"]) {
    assert.ok(!tags("gym", id).includes("floor_transfer"));
  }
  assert.ok(!tags("calisthenics", "incline_pushup").includes("floor_transfer"));
  assert.ok(tags("calisthenics", "inverted_row").includes("floor_transfer"));
});

test("overhead motion is explicit rather than assigned to every shoulder exercise", () => {
  for (const id of ["overhead_press", "dumbbell_shoulder_press", "triceps_extension", "lat_pulldown", "barbell_pullover", "dumbbell_pullover", "pullover_machine", "assisted_pull_up_machine"]) {
    assert.ok(tags("gym", id).includes("overhead_reach"));
  }
  for (const id of ["raise", "face_pull", "bench_press", "incline_dumbbell_press", "pec_deck_butterfly_machine", "curl"]) {
    assert.ok(!tags("gym", id).includes("overhead_reach"));
  }
  assert.ok(tags("calisthenics", "pike_pushup").includes("overhead_reach"));
});

test("lower body, support and load-bearing joints have distinct tags", () => {
  assert.deepEqual(tags("gym", "leg_extension"), ["knee"]);
  assert.deepEqual(tags("gym", "leg_curl"), ["knee", "deep_knee_bend"]);
  assert.ok(!tags("gym", "romanian_deadlift").includes("deep_knee_bend"));
  assert.ok(tags("calisthenics", "step_up").includes("balance_challenge"));
  assert.ok(tags("calisthenics", "squat").includes("balance_challenge"));
  assert.ok(!tags("calisthenics", "chair_sit_to_stand").includes("balance_challenge"));
  assert.ok(!tags("calisthenics", "supported_reverse_lunge").includes("balance_challenge"));
  assert.ok(tags("gym", "squat").includes("wrist"));
  assert.ok(!tags("calisthenics", "squat").includes("wrist"));
  assert.ok(tags("gym", "row").includes("hip"));
  assert.ok(!tags("gym", "chest_supported_dumbbell_row").includes("balance_challenge"));
  assert.ok(tags("gym", "chest_supported_dumbbell_row").includes("back"));
});

test("validation rejects null, empty, blank, unknown and duplicate tags", () => {
  for (const value of [null, undefined, [], [null], [""], [" "], ["sholder"], ["chest"], ["wrist", "wrist"], "wrist"]) {
    assert.equal(validMovementTags(value), false);
  }
  assert.equal(validMovementTags(["shoulder", "elbow", "wrist"]), true);
});
