import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { eq } from "drizzle-orm";
import { validMovementTags } from "../../src/modules/catalog/movement-tags";
import { reviewedMovementTags } from "../fixtures/reviewed-movement-tags";

loadEnvConfig(process.cwd());

async function main() {
  const { getDatabase, getPool } = await import("../../src/db/client");
  const { exerciseCatalog, catalogState } = await import("../../src/db/schema");
  try {
    const db = getDatabase();
    const rows = await db.select().from(exerciseCatalog);
    assert.equal(rows.length, reviewedMovementTags.length);
    for (const row of rows) {
      assert.ok(validMovementTags(row.movementTags), `${row.mode}/${row.id} has invalid/empty tags`);
      const expected = reviewedMovementTags.find((r) => r.mode === row.mode && r.id === row.id);
      assert.ok(expected, `Unreviewed exercise: ${row.mode}/${row.id}`);
      assert.deepEqual(row.movementTags, expected.tags, `Unexpected tags: ${row.mode}/${row.id}`);
    }
    const [state] = await db.select().from(catalogState).where(eq(catalogState.name, "exercises"));
    assert.ok(state.version > BigInt(0));
    console.info(`Movement tags integration passed: ${rows.length} exercises, 0 null/empty/invalid tags, catalogVersion=${state.version}`);
  } finally {
    await getPool().end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
