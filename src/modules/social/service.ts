import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/src/db/client";
import { socialPosts, socialReports, users } from "@/src/db/schema";
import { ApiError, badRequest, conflict, forbidden } from "@/src/lib/api-error";
import { signToken, verifyToken } from "@/src/lib/signed-token";
import { canonicalRequestHash } from "@/src/modules/sync/encoding";
import { lockActiveAccount } from "@/src/modules/accounts/access";

const cleanLabel = z.string().trim().min(1).max(80).refine(s => ![...s].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127));
const uuid = z.uuid().transform(s => s.toLowerCase());
export const publishPostSchema = z.object({ postId: uuid, publish: z.literal(true), authorLabel: cleanLabel, body: z.string().trim().min(1).max(2000) }).strict();
export const postIdSchema = z.object({ postId: uuid }).strict();
export const reportPostSchema = z.object({ postId: uuid, reason: z.enum(["spam", "harassment", "unsafe_content", "privacy", "other"]), details: z.string().max(1000).nullable().default(null) }).strict();
export const feedQuerySchema = z.object({ cursor: z.string().min(1).max(2048).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }).strict();
const feedCursorSchema = z.object({ beforeAt: z.iso.datetime({ offset: true }), beforeId: z.uuid() }).strict();

export async function publishPost(userId: string, body: z.infer<typeof publishPostSchema>) {
  const hash = canonicalRequestHash(body);
  return getDatabase().transaction(async tx => {
    await lockActiveAccount(tx, userId);
    const [inserted] = await tx.insert(socialPosts).values({ id: body.postId, userId, authorLabel: body.authorLabel, body: body.body, requestHash: hash, createdAt: new Date() }).onConflictDoNothing().returning();
    const post = inserted ?? (await tx.select().from(socialPosts).where(eq(socialPosts.id, body.postId)).limit(1))[0];
    if (!post || post.userId !== userId) throw conflict("POST_ID_UNAVAILABLE", "Choose a new post ID");
    if (post.deletedAt) throw conflict("POST_DELETED", "A deleted post cannot be republished with its old ID");
    if (post.requestHash !== hash) throw conflict("POST_ID_REUSE", "This post ID already represents different content");
    return { postId: post.id, publishedAt: post.createdAt.toISOString(), duplicate: !inserted };
  });
}

export async function readFeed(userId: string, query: z.infer<typeof feedQuerySchema>) {
  const cursor = query.cursor ? feedCursorSchema.parse(verifyToken(`social-feed:${userId}`, query.cursor)) : null;
  const rows = await getDatabase().select({ id: socialPosts.id, userId: socialPosts.userId, authorLabel: socialPosts.authorLabel, body: socialPosts.body, createdAt: socialPosts.createdAt,
    timestampKey: sql<string>`to_char(${socialPosts.createdAt} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  }).from(socialPosts).innerJoin(users, eq(users.id, socialPosts.userId)).where(and(eq(users.status, "active"), isNull(socialPosts.deletedAt), eq(socialPosts.moderationStatus, "visible"),
    cursor ? sql`(${socialPosts.createdAt},${socialPosts.id}) < (${cursor.beforeAt}::timestamptz,${cursor.beforeId}::uuid)` : undefined,
  )).orderBy(desc(socialPosts.createdAt), desc(socialPosts.id)).limit(query.limit + 1);
  const page = rows.slice(0, query.limit); const last = page.at(-1);
  return { items: page.map(p => ({ postId: p.id, authorLabel: p.authorLabel, body: p.body, createdAt: p.createdAt.toISOString(), isMine: p.userId === userId })),
    nextCursor: rows.length > query.limit && last ? signToken(`social-feed:${userId}`, { beforeAt: last.timestampKey, beforeId: last.id }) : null };
}

export async function deletePost(userId: string, postId: string) {
  return getDatabase().transaction(async tx => {
    await lockActiveAccount(tx, userId);
    const [post] = await tx.select().from(socialPosts).where(and(eq(socialPosts.id, postId), eq(socialPosts.userId, userId))).for("update");
    if (!post) throw new ApiError(404, "POST_NOT_FOUND", "Post not found");
    if (!post.deletedAt) await tx.update(socialPosts).set({ deletedAt: new Date(), body: "[deleted]", authorLabel: "[deleted]" }).where(eq(socialPosts.id, postId));
    return { status: "deleted" };
  });
}

export async function reportPost(userId: string, body: z.infer<typeof reportPostSchema>) {
  return getDatabase().transaction(async tx => {
    await lockActiveAccount(tx, userId);
    const [post] = await tx.select().from(socialPosts).where(and(eq(socialPosts.id, body.postId), isNull(socialPosts.deletedAt), eq(socialPosts.moderationStatus, "visible"))).for("share");
    if (!post) throw new ApiError(404, "POST_NOT_FOUND", "Post not found");
    if (post.userId === userId) throw badRequest("OWN_POST_REPORT", "Delete your own post instead");
    const [saved] = await tx.insert(socialReports).values({ postId: body.postId, reporterId: userId, reason: body.reason, details: body.details }).onConflictDoNothing().returning({ id: socialReports.id });
    return { status: "received", duplicate: !saved };
  });
}

// Only trusted operational tooling imports these functions; no moderator API
// accepts a role/userId supplied by mobile or treats the Auth user role as admin.
export async function moderateReport(reportId: string, action: "hide" | "dismiss", moderatorRef: string) {
  cleanLabel.parse(moderatorRef);
  return getDatabase().transaction(async tx => {
    const [report] = await tx.select().from(socialReports).where(eq(socialReports.id, reportId)).for("update");
    if (!report) throw new ApiError(404, "REPORT_NOT_FOUND", "Report not found");
    if (report.status === "resolved") return { status: "resolved", action: report.resolution };
    if (action === "hide") await tx.update(socialPosts).set({ moderationStatus: "hidden" }).where(eq(socialPosts.id, report.postId));
    await tx.update(socialReports).set({ status: "resolved", resolution: action, resolvedAt: new Date(), moderatorRef }).where(eq(socialReports.id, reportId));
    return { status: "resolved", action };
  });
}

export function requireSocialEnabled() {
  if (process.env.SOCIAL_PUBLISHING_ENABLED !== "true") throw forbidden("SOCIAL_NOT_ENABLED", "Community publishing is not enabled");
}
