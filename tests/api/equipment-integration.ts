import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { equipmentExercisesSchema } from "../../src/modules/equipment/query";

loadEnvConfig(process.cwd());

async function main() {
  const { getPool } = await import("../../src/db/client");
  const { getEquipmentCatalog, getEquipmentExercises } = await import("../../src/modules/equipment/service");
  const catalogRoute = await import("../../app/api/v1/catalog/equipment/route");
  const exercisesRoute = await import("../../app/api/v1/equipment/exercises/route");
  const photoRoute = await import("../../app/api/v1/equipment/recognize/route");
  try {
    const catalog = await getEquipmentCatalog();
    assert.equal(catalog.equipment.length, 28);
    assert.equal(catalog.matchType, "catalog");
    assert.equal((await getEquipmentCatalog("dambel")).equipment[0].id, "dumbbell");
    assert.equal((await getEquipmentCatalog("bar")).matchType, "candidates");
    assert.equal((await getEquipmentCatalog("not an exercise machine")).equipment.length, 0);
    const dumbbell = await getEquipmentExercises(["dumbbell"], "gym");
    assert.ok(dumbbell.ready.some((e) => e.id === "curl"));
    assert.ok(dumbbell.ready.some((e) => e.id === "press"));
    assert.ok(!dumbbell.ready.some((e) => e.id === "flat_dumbbell_bench_press"));
    assert.deepEqual(dumbbell.needsMoreEquipment.find((e) => e.id === "flat_dumbbell_bench_press")?.missingEquipmentOptions, [["bench"]]);
    assert.ok((await getEquipmentExercises(["dumbbell", "bench"], "gym")).ready.some((e) => e.id === "flat_dumbbell_bench_press"));
    assert.ok((await getEquipmentExercises(["pull_up_bar"], "calisthenics")).ready.some((e) => e.id === "pullup"));
    assert.deepEqual((await getEquipmentExercises(["mat"])).ready, []); // optional accessory, not invented requirements
    await assert.rejects(getEquipmentExercises(["unknown_machine"]));
    for (const item of catalog.equipment) {
      const match = await getEquipmentExercises([item.id]);
      for (const e of match.ready) assert.ok(e.requirements.some((group) => group.every((id) => id === item.id)));
      for (const e of match.needsMoreEquipment) assert.ok(e.missingEquipmentOptions.every((option) => option.length > 0 && !option.includes(item.id)));
    }
    const response = await catalogRoute.GET(new Request("http://localhost/api/v1/catalog/equipment?q=dambel"));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).equipment[0].id, "dumbbell");
    const ex = await exercisesRoute.GET(new Request("http://localhost/api/v1/equipment/exercises?equipmentIds=dumbbell,bench&mode=gym"));
    assert.equal(ex.status, 200);
    assert.ok((await ex.json()).ready.some((e: { id: string }) => e.id === "flat_dumbbell_bench_press"));
    assert.equal((await exercisesRoute.GET(new Request("http://localhost/api/v1/equipment/exercises?equipmentIds=unknown"))).status, 400);
    assert.throws(() => equipmentExercisesSchema.parse({ equipmentIds: "dumbbell,dumbbell" }));
    assert.equal((await photoRoute.POST(new Request("http://localhost/api/v1/equipment/recognize", { method: "POST" }))).status, 401);
    assert.equal((await photoRoute.OPTIONS(new Request("http://localhost/api/v1/equipment/recognize", { method: "OPTIONS" }))).status, 204);
    console.info("Equipment integration passed: 28 persisted tools, aliases, real exercise matches/missing tools, routes and photo authentication");
  } finally { await getPool().end(); }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
