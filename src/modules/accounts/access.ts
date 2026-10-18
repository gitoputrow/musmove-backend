import { eq } from "drizzle-orm";
import { users } from "@/src/db/schema";
import type { DatabaseTransaction } from "@/src/modules/sync/entities";
import { forbidden } from "@/src/lib/api-error";

// User lock precedes sync-state lock. Deletion takes the exclusive user lock.
export async function lockActiveAccount(transaction: DatabaseTransaction, userId: string) {
  const [user] = await transaction.select({ status: users.status }).from(users).where(eq(users.id, userId)).for("share");
  if (!user || user.status !== "active") throw forbidden("ACCOUNT_INACTIVE", "The account is not active");
}
