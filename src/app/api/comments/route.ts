import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, likes, posts, privacySettings, profiles, videos } from "@/db/schema";
import { getSessionUser, requireUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { getRelation, notify, bumpCommentCount } from "@/lib/services";
import { canComment, evaluatePrivacyRule, type PrivacyRule } from "@/lib/access";
import { commentCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const viewer = await getSessionUser(req);
    const url = new URL(req.url);
    const entityType = url.searchParams.get("entityType") === "video" ? "video" : "post";
    const entityId = url.searchParams.get("entityId");
    const cursor = url.searchParams.get("cursor");
    if (!entityId) throw new ApiError(422, "missing_entity", "entityId is required");

    const conditions = [
      eq(comments.entityType, entityType),
      eq(comments.entityId, entityId),
      sql`${comments.deletedAt} is null`,
    ];
    if (cursor) conditions.push(sql`${comments.createdAt} < ${new Date(cursor)}`);
    const rows = await db
      .select()
      .from(comments)
      .where(and(...conditions))
      .orderBy(desc(comments.createdAt))
      .limit(26);

    const authors = rows.length
      ? await db
          .select({ id: profiles.id, username: profiles.username, displayName: profiles.displayName, avatarKey: profiles.avatarKey })
          .from(profiles)
          .where(inArray(profiles.id, rows.map((r) => r.authorId)))
      : [];
    const authorMap = new Map(authors.map((a) => [a.id, a]));
    const likedIds = viewer
      ? (
          await db
            .select({ entityId: likes.entityId })
            .from(likes)
            .where(and(eq(likes.entityType, "comment"), eq(likes.userId, viewer.id), inArray(likes.entityId, rows.map((r) => r.id))))
        ).map((r) => r.entityId)
      : [];
    const likedSet = new Set(likedIds);

    return ok({
      comments: rows.map((c) => ({
        id: c.id,
        text: c.text,
        parentId: c.parentId,
        likeCount: c.likeCount,
        likedByViewer: likedSet.has(c.id),
        createdAt: c.createdAt.toISOString(),
        isMine: c.authorId === viewer?.id,
        author: {
          id: c.authorId,
          username: authorMap.get(c.authorId)?.username ?? "user",
          displayName: authorMap.get(c.authorId)?.displayName ?? "UZON user",
          avatarUrl: authorMap.get(c.authorId)?.avatarKey ? `/api/media/${authorMap.get(c.authorId)!.avatarKey}` : null,
        },
      })),
      nextCursor: rows.length === 26 ? rows[rows.length - 1]!.createdAt.toISOString() : null,
    });
  } catch (error) {
    return toResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await rateLimit(`comment:${user.id}`, 30, 300);
    const body = await readBody(req, commentCreateSchema);

    const target =
      body.entityType === "post"
        ? await db.select().from(posts).where(and(eq(posts.id, body.entityId), sql`${posts.deletedAt} is null`)).limit(1)
        : await db.select().from(videos).where(and(eq(videos.id, body.entityId), sql`${videos.deletedAt} is null`)).limit(1);
    const row = target[0];
    if (!row) throw new ApiError(404, "not_found", "Content not found");

    const ownerId = body.entityType === "post" ? (row as typeof posts.$inferSelect).authorId : (row as typeof videos.$inferSelect).ownerId;
    const commentsEnabled = row.commentsEnabled;
    const ctx = await getRelation(user.id, ownerId);
    if (ctx.blocked) throw new ApiError(403, "blocked", "You cannot comment here");

    if (ownerId !== user.id) {
      const privacy = await db.select().from(privacySettings).where(eq(privacySettings.userId, ownerId)).limit(1);
      const rule = (privacy[0]?.whoCanComment ?? "everyone") as PrivacyRule;
      if (!canComment(rule, commentsEnabled, ctx)) {
        throw new ApiError(403, "comments_restricted", "The author restricted who can comment");
      }
    } else if (!commentsEnabled) {
      throw new ApiError(403, "comments_disabled", "Comments are disabled");
    }

    const [created] = await db
      .insert(comments)
      .values({
        entityType: body.entityType,
        entityId: body.entityId,
        authorId: user.id,
        text: body.text.trim(),
        parentId: body.parentId ?? null,
      })
      .returning();

    await bumpCommentCount(body.entityType, body.entityId, 1);
    if (ownerId !== user.id) {
      await notify({
        userId: ownerId,
        type: body.parentId ? "reply" : "comment",
        actorId: user.id,
        entityType: body.entityType,
        entityId: body.entityId,
        preview: body.text.slice(0, 120),
        category: body.parentId ? "replies" : "comments",
      });
    }
    void evaluatePrivacyRule;
    return ok(
      {
        comment: {
          id: created!.id,
          text: created!.text,
          likeCount: 0,
          createdAt: created!.createdAt.toISOString(),
          isMine: true,
          author: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarKey ? `/api/media/${user.avatarKey}` : null },
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return toResponse(error);
  }
}
