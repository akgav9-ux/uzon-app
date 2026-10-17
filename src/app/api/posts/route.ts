import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, conversations, media, posts, postMedia, videos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { buildPostsPayload } from "@/lib/serialize";
import { assertBlockedPair } from "@/lib/services";
import { extractHashtags } from "@/lib/utils";
import { postCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const url = new URL(req.url);
    const authorId = url.searchParams.get("authorId");
    const conversationId = url.searchParams.get("conversationId");
    const cursor = url.searchParams.get("cursor");
    const limit = Math.min(30, Math.max(1, Number(url.searchParams.get("limit") ?? 12)));
    if (!authorId && !conversationId) throw new ApiError(422, "missing_filter", "authorId or conversationId is required");

    const conditions = [sql`${posts.deletedAt} is null`];
    if (authorId) conditions.push(eq(posts.authorId, authorId));
    if (conversationId) conditions.push(eq(posts.conversationId, conversationId));
    if (cursor) conditions.push(sql`${posts.createdAt} < ${new Date(cursor)}`);
    if (authorId && authorId !== user.id) conditions.push(sql`(${posts.audience} = 'public' or ${posts.authorId} = ${user.id})`);

    const rows = await db
      .select()
      .from(posts)
      .where(and(...conditions))
      .orderBy(desc(posts.createdAt))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return ok({ posts: await buildPostsPayload(page, user.id), nextCursor: hasMore ? page[page.length - 1]!.createdAt.toISOString() : null });
  } catch (error) {
    return toResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await rateLimit(`post:${user.id}`, 20, 300);
    const body = await readBody(req, postCreateSchema);
    const text = body.text?.trim() ?? "";
    const mediaIds = body.mediaIds ?? [];
    if (!text && !mediaIds.length && !body.videoId) throw new ApiError(422, "empty_post", "Write something or attach media");

    let conversationId: string | null = null;
    if (body.conversationId) {
      const [conv] = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, body.conversationId), eq(conversations.kind, "channel")))
        .limit(1);
      if (!conv) throw new ApiError(404, "channel_not_found", "Channel not found");
      const [membership] = await db
        .select()
        .from(conversationMembers)
        .where(and(eq(conversationMembers.conversationId, conv.id), eq(conversationMembers.userId, user.id)))
        .limit(1);
      if (!membership) throw new ApiError(403, "not_a_member", "Join the channel first");
      if (conv.onlyAdminsCanPost && membership.role !== "owner" && membership.role !== "admin") {
        throw new ApiError(403, "no_permission", "Only admins can post in this channel");
      }
      conversationId = conv.id;
    }

    if (body.videoId) {
      const [video] = await db.select().from(videos).where(and(eq(videos.id, body.videoId), eq(videos.ownerId, user.id))).limit(1);
      if (!video) throw new ApiError(404, "video_not_found", "Video not found");
      await assertBlockedPair(user.id, video.ownerId);
    }

    const kind = body.videoId ? "video" : mediaIds.length > 1 ? "album" : mediaIds.length === 1 ? "photo" : "text";
    const [row] = await db
      .insert(posts)
      .values({
        authorId: user.id,
        conversationId,
        text: text || null,
        kind,
        audience: body.audience ?? "public",
        videoId: body.videoId ?? null,
        commentsEnabled: body.commentsEnabled ?? true,
      })
      .returning();

    if (mediaIds.length) {
      const owned = await db.select().from(media).where(and(inArray(media.id, mediaIds), eq(media.ownerId, user.id)));
      if (owned.length !== mediaIds.length) throw new ApiError(403, "forbidden", "You can only attach your own media");
      await db.insert(postMedia).values(owned.map((m, i) => ({ postId: row!.id, mediaId: m.id, position: i })));
    }

    const hashtags = extractHashtags(text);
    void hashtags;
    const payload = await buildPostsPayload([row!], user.id);
    return ok({ post: payload[0] }, { status: 201 });
  } catch (error) {
    return toResponse(error);
  }
}
