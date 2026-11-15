import assert from "node:assert/strict";
import { test } from "node:test";
import { completedWorkoutSchema } from "../../src/modules/online/dto";
import { groupWorkoutSetLog, workoutSetLogOutputSchema } from "../../src/modules/workouts/set-log";
import { canonicalRequestHash } from "../../src/modules/sync/encoding";

const snapshot = (mode: "gym" | "calisthenics") => ({ id: "squat", mode, idLabel: "Squat", enLabel: "Squat", requirements: [[]], sets: 2, reps: 8, targetWeightKg: null });
const first = { setNumber: 1, completed: true, reps: 8, weightKg: 30 };
const group = { exerciseId: "squat", exerciseMode: "gym", sets: [first] };
const input = {
  id: "grouped", source: "manual", startedAt: "2020-01-01T10:00:00Z", finishedAt: "2020-01-01T11:00:00Z", recordedOn: "2020-01-01",
  exerciseSnapshot: [snapshot("gym"), snapshot("calisthenics")],
  setLog: [group, { exerciseId: "squat", exerciseMode: "calisthenics", sets: [{ ...first, weightKg: 0 }] }],
};

test("grouped set input preserves exact results and separates duplicate IDs across modes", () => {
  const normalized = completedWorkoutSchema.parse(input);
  assert.deepEqual(normalized.setLog, [
    { ...first, exerciseId: "squat", exerciseMode: "gym" as const },
    { ...first, weightKg: 0, exerciseId: "squat", exerciseMode: "calisthenics" as const },
  ]);
  assert.deepEqual(groupWorkoutSetLog(normalized.setLog, "mixed"), input.setLog);
  assert.ok(workoutSetLogOutputSchema.safeParse(input.setLog).success);
});

test("single-mode groups inherit/match workout mode and legacy normalized body hashes remain unchanged", () => {
  const { mode: _mode, ...exercise } = snapshot("gym"); void _mode;
  const flat = { ...input, mode: "gym", exerciseSnapshot: [exercise], setLog: [{ ...first, exerciseId: "squat" }] };
  const normalized = completedWorkoutSchema.parse(flat);
  assert.deepEqual(normalized, flat);
  assert.equal(canonicalRequestHash(normalized), canonicalRequestHash(flat));
  for (const exerciseMode of [undefined, "gym"]) {
    const grouped = completedWorkoutSchema.parse({ ...flat, setLog: [{ ...group, exerciseMode }] });
    assert.deepEqual(grouped, normalized);
  }
  assert.throws(() => completedWorkoutSchema.parse({ ...flat, setLog: [{ ...group, exerciseMode: "calisthenics" }] }));
  assert.deepEqual(groupWorkoutSetLog(normalized.setLog, "gym"), [group]);
});

test("group validation rejects mixed shapes, ambiguous groups and sets, unknown references and invalid modes", () => {
  const invalid = [
    [{ ...first, exerciseId: "squat", exerciseMode: "gym" }, group],
    [group, group],
    [{ ...group, sets: [] }, { ...group, sets: [] }],
    [{ ...group, exerciseId: "missing", sets: [] }],
    [{ ...group, exerciseMode: undefined }],
    [{ ...group, exerciseMode: "mixed" }],
    [{ ...group, sets: [first, first] }],
    [{ ...group, sets: [{ ...first, setNumber: 3 }] }],
    [{ ...group, sets: [{ ...first, exerciseId: "different" }] }],
    [{ ...group, sets: [{ ...first, exerciseMode: "calisthenics" }] }],
    [{ ...group, sets: Array.from({ length: 11 }, (_, i) => ({ ...first, setNumber: i + 1 })) }],
  ];
  for (const setLog of invalid) assert.throws(() => completedWorkoutSchema.parse({ ...input, setLog }));
});

test("empty groups normalize away; output preserves null/zero, absent fields and legacy orphan sets", () => {
  assert.deepEqual(completedWorkoutSchema.parse({ ...input, setLog: [{ ...group, sets: [] }] }).setLog, []);
  assert.deepEqual(groupWorkoutSetLog([], "gym"), []);
  const logs = [
    { ...first, exerciseId: "missing-in-snapshot", reps: null, weightKg: null },
    { ...first, exerciseId: "missing-in-snapshot", setNumber: 2, weightKg: 0 },
  ];
  assert.deepEqual(groupWorkoutSetLog(logs, "gym"), [{
    exerciseId: "missing-in-snapshot", exerciseMode: "gym", sets: [
      { ...first, reps: null, weightKg: null }, { ...first, setNumber: 2, weightKg: 0 },
    ],
  }]);
  assert.equal(groupWorkoutSetLog(logs, "mixed")[0].exerciseMode, null);
  assert.deepEqual(logs[0], { ...first, exerciseId: "missing-in-snapshot", reps: null, weightKg: null });
});
