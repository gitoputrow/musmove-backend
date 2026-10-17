import { loadEnvConfig } from "@next/env";
import { and, asc, eq, gt, isNull } from "drizzle-orm";

loadEnvConfig(process.cwd());

async function main() {
  const { getDatabase, getPool } = await import("./client");
  const { profiles, syncState } = await import("./schema");
  const { storeNutritionEstimate } = await import("../modules/nutrition/storage");
  const db = getDatabase();
  let processed = 0;
  let after: string | undefined;
  try {
    while (true) {
      const batch = await db.select({ userId: profiles.userId }).from(profiles)
        .where(and(isNull(profiles.deletedAt), after ? gt(profiles.userId, after) : undefined))
        .orderBy(asc(profiles.userId)).limit(100);
      if (batch.length === 0) break;
      for (const row of batch) {
        await db.transaction(async (transaction) => {
          // Same lock order as sync; no profile/version/change-log mutations.
          await transaction.select().from(syncState).where(eq(syncState.userId, row.userId)).for("update");
          await transaction.select().from(profiles).where(eq(profiles.userId, row.userId)).for("update");
          await storeNutritionEstimate(transaction, row.userId);
        });
        processed++;
      }
      after = batch[batch.length - 1].userId;
    }
    console.info(`Nutrition backfill completed for ${processed} profiles (idempotent)`);
  } finally {
    await getPool().end();
  }
}
void main().catch(() => { console.error("Nutrition backfill failed"); process.exitCode = 1; });
