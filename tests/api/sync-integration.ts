import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { loadEnvConfig } from "@next/env";
import { inArray } from "drizzle-orm";

loadEnvConfig(process.cwd());
process.env.SYNC_CURSOR_SECRET = "sync-integration-test-secret-32-characters";

async function main() {
const { getDatabase, getPool } = await import("../../src/db/client");
const { getExerciseCatalog } = await import("../../src/modules/catalog/exercises");
const { getProgramCatalog } = await import("../../src/modules/programs/service");
const { syncState, users } = await import("../../src/db/schema");
const { demoImportSchema, importDemo } = await import("../../src/modules/imports/demo");
const { syncPushSchema } = await import("../../src/modules/sync/dto");
const { bootstrap, pullChanges, pushOperations } = await import(
  "../../src/modules/sync/service"
);

const database = getDatabase();
const testUserIds: string[] = [];

async function createTestUser() {
  const [user] = await database
    .insert(users)
    .values({ issuer: `test://sync/${randomUUID()}`, subject: randomUUID() })
    .returning({ id: users.id });
  await database.insert(syncState).values({ userId: user.id });
  testUserIds.push(user.id);
  return user.id;
}

try {
  const catalog = await getExerciseCatalog();
  assert.ok(catalog.exercises.length >= 51);
  assert.ok(catalog.exercises.some((exercise) => exercise.id === "deadlift"));
  assert.ok(catalog.exercises.some((exercise) => exercise.id === "chinup"));
  assert.equal(new Set(catalog.exercises.map((exercise) => `${exercise.mode}:${exercise.id}`)).size, catalog.exercises.length);
  const userId = await createTestUser();
  const createOperation = {
    action: "upsert" as const,
    baseVersion: "0",
    entityId: "profile",
    entityType: "profile" as const,
    operationId: randomUUID(),
    payload: {
      displayName: "Integration Test",
      motivationEnabled: true,
      setupCompleted: false,
    },
  };
  const createRequest = syncPushSchema.parse({
    schemaVersion: 1,
    deviceId: "integration-test",
    operations: [createOperation],
  });

  const created = await pushOperations(userId, createRequest);
  assert.equal(created.results[0].status, "applied");
  assert.equal("version" in created.results[0] && created.results[0].version, "1");

  const duplicate = await pushOperations(userId, createRequest);
  assert.equal(duplicate.results[0].status, "duplicate");

  const conflictRequest = syncPushSchema.parse({
    schemaVersion: 1,
    deviceId: "integration-test",
    operations: [{ ...createOperation, operationId: randomUUID() }],
  });
  const stale = await pushOperations(userId, conflictRequest);
  assert.equal(stale.results[0].status, "conflict");

  const updateRequest = syncPushSchema.parse({
    schemaVersion: 1,
    deviceId: "integration-test",
    operations: [
      {
        ...createOperation,
        baseVersion: "1",
        operationId: randomUUID(),
        payload: { ...createOperation.payload, displayName: "Updated" },
      },
    ],
  });
  const updated = await pushOperations(userId, updateRequest);
  assert.equal(updated.results[0].status, "applied");

  const snapshot = await bootstrap(userId);
  assert.equal(snapshot.entities.profile.length, 1);
  assert.equal(snapshot.entities.profile[0].version, "2");

  const publicPrograms = await getProgramCatalog();
  assert.equal(publicPrograms.programs.length, 12);
  await assert.rejects(() => getProgramCatalog(userId), { code: "PREFERENCES_REQUIRED" });
  const recommendationUser = await createTestUser();
  const preferencesResult = await pushOperations(recommendationUser, syncPushSchema.parse({
    schemaVersion: 1, deviceId: "integration-test", operations: [
      { ...createOperation, operationId: randomUUID(), payload: { focus: "back", sessionMinutes: 20, trainingLevel: "intermediate", ageYears: 30, goal: "bulk" } },
      { operationId: randomUUID(), action: "upsert", baseVersion: "0", entityType: "training_preferences", entityId: "training_preferences", payload: { mode: "calisthenics", equipment: [], noEquipment: true } },
    ],
  }));
  assert.ok(preferencesResult.results.every((result) => result.status === "applied"));
  const noEquipmentPrograms = await getProgramCatalog(recommendationUser);
  assert.equal(noEquipmentPrograms.programs.length, 0);
  await pushOperations(recommendationUser, syncPushSchema.parse({
    schemaVersion: 1, deviceId: "integration-test", operations: [
      { operationId: randomUUID(), action: "upsert", baseVersion: "1", entityType: "training_preferences", entityId: "training_preferences", payload: { mode: "calisthenics", equipment: ["pull_up_bar"], noEquipment: false } },
    ],
  }));
  const equippedPrograms = await getProgramCatalog(recommendationUser);
  assert.equal(equippedPrograms.programs.length, 1);
  assert.equal(equippedPrograms.programs[0].id, "app-calisthenics-back-v1");
  assert.equal(equippedPrograms.programs[0].exercises[0].id, "pullup");

  const abilityProfile = { ageYears: 30, focus: "chest", sessionMinutes: 30, goal: "cut", formulaSex: "female", gender: "female", trainingContext: { healthStatus: "no_known_restrictions", recoveryStatus: "recovered" }, trainingLevel: "beginner", exerciseCapabilities: [
    { exerciseId: "pushup", mode: "calisthenics", maxReps: 0, weightKg: null },
    { exerciseId: "knee_pushup", mode: "calisthenics", maxReps: 5, weightKg: null },
  ] };
  const abilitySaved = await pushOperations(recommendationUser, syncPushSchema.parse({
    schemaVersion: 1, deviceId: "integration-test", operations: [
      { ...createOperation, operationId: randomUUID(), baseVersion: "1", payload: abilityProfile },
    ],
  }));
  assert.equal(abilitySaved.results[0].status, "applied");
  const abilityPrograms = await getProgramCatalog(recommendationUser);
  assert.equal(abilityPrograms.programs[0].exercises[0].id, "knee_pushup");
  assert.equal(abilityPrograms.programs[0].exercises[0].reps, 4);
  const abilitySnapshot = await bootstrap(recommendationUser);
  const abilityPayload = abilitySnapshot.entities.profile[0].payload;
  assert.ok(abilityPayload && typeof abilityPayload === "object" && !Array.isArray(abilityPayload));
  assert.equal(abilityPayload.trainingLevel, "beginner");
  assert.deepEqual(abilityPayload.exerciseCapabilities, abilityProfile.exerciseCapabilities);
  const legacyUpdate = await pushOperations(recommendationUser, syncPushSchema.parse({
    schemaVersion: 1, deviceId: "integration-test", operations: [
      { ...createOperation, operationId: randomUUID(), baseVersion: "2", payload: { ageYears: 30, focus: "chest", sessionMinutes: 30, goal: "cut" } },
    ],
  }));
  assert.equal(legacyUpdate.results[0].status, "applied");
  const abilityPull = await pullChanges(recommendationUser, abilitySnapshot.cursor, 100);
  const resolvedPayload = abilityPull.changes[0].payload;
  assert.ok(resolvedPayload && typeof resolvedPayload === "object" && !Array.isArray(resolvedPayload));
  assert.deepEqual(resolvedPayload.exerciseCapabilities, abilityProfile.exerciseCapabilities);
  assert.equal(resolvedPayload.gender, "female");
  assert.deepEqual(resolvedPayload.trainingContext, abilityProfile.trainingContext);
  const mobilityUpdated = await pushOperations(recommendationUser, syncPushSchema.parse({
    schemaVersion: 1, deviceId: "integration-test", operations: [
      { ...createOperation, operationId: randomUUID(), baseVersion: "3", payload: { ...abilityProfile, trainingContext: { mobilityLimitations: ["floor_transfer"] } } },
    ],
  }));
  assert.equal(mobilityUpdated.results[0].status, "applied");
  const mobilityPrograms = await getProgramCatalog(recommendationUser);
  assert.equal(mobilityPrograms.programs[0].exercises[0].id, "wall_pushup");
  const mobilitySnapshot = await bootstrap(recommendationUser);
  const mobilityPayload = mobilitySnapshot.entities.profile[0].payload;
  assert.ok(mobilityPayload && typeof mobilityPayload === "object" && !Array.isArray(mobilityPayload));
  assert.deepEqual(mobilityPayload.trainingContext, { ...abilityProfile.trainingContext, mobilityLimitations: ["floor_transfer"] });
  const pregnancyUpdated = await pushOperations(recommendationUser, syncPushSchema.parse({
    schemaVersion: 1, deviceId: "integration-test", operations: [
      { ...createOperation, operationId: randomUUID(), baseVersion: "4", payload: { ...abilityProfile, trainingContext: { pregnancyStatus: "pregnant" } } },
    ],
  }));
  assert.equal(pregnancyUpdated.results[0].status, "applied");
  const pregnancyPrograms = await getProgramCatalog(recommendationUser);
  assert.equal(pregnancyPrograms.programs.length, 0);
  assert.equal("reason" in pregnancyPrograms && pregnancyPrograms.reason, "SPECIALIZED_PROGRAM_REQUIRED");

  const thirdRequest = syncPushSchema.parse({
    schemaVersion: 1,
    deviceId: "integration-test",
    operations: [
      {
        ...createOperation,
        baseVersion: "2",
        operationId: randomUUID(),
        payload: { ...createOperation.payload, displayName: "Third" },
      },
    ],
  });
  await pushOperations(userId, thirdRequest);
  const pulled = await pullChanges(userId, snapshot.cursor, 100);
  assert.equal(pulled.changes.length, 1);
  assert.equal(pulled.changes[0].version, "3");
  assert.equal(pulled.hasMore, false);
  await assert.rejects(() => pullChanges(userId, `${snapshot.cursor}tampered`, 100));

  const importUserId = await createTestUser();
  const importRequest = demoImportSchema.parse({
    schemaVersion: 1,
    importId: randomUUID(),
    entities: [
      {
        entityType: "profile",
        entityId: "profile",
        payload: {
          displayName: "Imported",
          motivationEnabled: true,
          setupCompleted: true,
        },
      },
    ],
  });
  const imported = await importDemo(importUserId, importRequest);
  assert.equal(imported.duplicate, false);
  assert.ok("importedCount" in imported);
  assert.equal(imported.importedCount, 1);
  const repeatedImport = await importDemo(importUserId, importRequest);
  assert.equal(repeatedImport.duplicate, true);

  console.log("Sync API service integration test passed");
} finally {
  if (testUserIds.length > 0) {
    await database.delete(users).where(inArray(users.id, testUserIds));
  }
  await getPool().end();
}
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

