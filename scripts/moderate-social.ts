import { eq } from "drizzle-orm";
import { z } from "zod";
import { loadOperationsEnvironment } from "./operations-env";

async function main() {
  loadOperationsEnvironment();
  const { getDatabase, getPool } = await import("../src/db/client");
  const { socialReports, socialPosts } = await import("../src/db/schema");
  try {
    const id = process.argv.find(s => s.startsWith("--report-id="))?.slice(12);
    if (!id) {
      const reports = await getDatabase().select({ reportId: socialReports.id, postId: socialReports.postId, reason: socialReports.reason, createdAt: socialReports.createdAt }).from(socialReports).where(eq(socialReports.status, "open")).limit(50);
      console.info(JSON.stringify({ openReports: reports, note: "Private moderation metadata; do not publish logs" })); return;
    }
    const reportId = z.uuid().parse(id);
    if (process.argv.includes("--inspect")) {
      const report = await getDatabase().select({ reportId: socialReports.id, reason: socialReports.reason, details: socialReports.details, status: socialReports.status, postId: socialPosts.id, body: socialPosts.body })
        .from(socialReports).innerJoin(socialPosts, eq(socialPosts.id, socialReports.postId)).where(eq(socialReports.id, reportId)).limit(1);
      console.info(JSON.stringify({ sensitiveModerationView: report, note: "Private content; do not publish or retain terminal logs" })); return;
    }
    const action = z.enum(["hide", "dismiss"]).parse(process.argv.find(s => s.startsWith("--action="))?.slice(9));
    if (!process.argv.includes("--execute")) { console.info({ mode: "dry-run", reportId, action }); return; }
    const { moderateReport } = await import("../src/modules/social/service");
    const operator = z.string().trim().min(1).max(80).parse(process.argv.find(s => s.startsWith("--operator="))?.slice(11));
    console.info(await moderateReport(reportId, action, operator));
  } finally { await getPool().end(); }
}
void main().catch(() => { console.error("Moderation failed; credentials and private content withheld"); process.exitCode = 1; });
