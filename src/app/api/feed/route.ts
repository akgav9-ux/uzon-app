import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blocks, conversationMembers, follows, posts, profiles } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ok, rateLimit, toResponse } from "@/lib/http";
import { buildPostsPayload } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_LIMIT = 30;

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    await rateLimit(`feed:${user.id}`, 240, 60);
    const url = new URL(req.url);
    const tab = url.searchParams.get("tab") ?? "forYou";
    const cursor = url.searchParams.get("cursor");
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit") ?? 12)));

    const followingRows = await db
      .select({ followingId: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, user.id));
    const followingIds = followingRows.map((r) => r.followingId);
    const subscribed = await db
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, user.id));
    const subscribedIds = subscribed.map((r) => r.conversationId);
    const blockedRows = await db
      .select({ a: blocks.blockerId, b: blocks.blockedId })
      .from(blocks)
      .where(or(eq(blocks.blockerId, user.id), eq(blocks.blockedId, user.id)));
    const excludedIds = blockedRows.filter((r) => r.a !== user.id).map((r) => r.b);
    // Private profiles: their posts are only visible to followers (handled by the
    // audience filter below, since a private profile's posts use "followers").
    const conditions = [sql`${posts.deletedAt} is null`];
    if (cursor) conditions.push(lt(posts.createdAt, new Date(cursor)));
    if (excludedIds.length) conditions.push(sql`${posts.authorId} not in (${sql.join(excludedIds.map((id) => sql`${id}`), sql`, `)})`);

    if (tab === "following") {
      const ids = [user.id, ...followingIds];
      conditions.push(or(inArray(posts.authorId, ids), subscribedIds.length ? inArray(posts.conversationId, subscribedIds) : sql`false`)!);
    } else if (tab === "latest") {
      conditions.push(
        or(
          eq(posts.authorId, user.id),
          eq(posts.audience, "public"),
          and(eq(posts.audience, "followers"), inArray(posts.authorId, followingIds.length ? followingIds : [user.id])),
          subscribedIds.length ? inArray(posts.conversationId, subscribedIds) : sql`false`,
        )!,
      );
    } else {
      // "For you": chronological public posts from followed authors first, then
      // public posts ranked by recent engagement. No simulated AI ranking.
      conditions.push(
        or(
          eq(posts.authorId, user.id),
          eq(posts.audience, "public"),
          and(eq(posts.audience, "followers"), inArray(posts.authorId, followingIds.length ? followingIds : [user.id])),
          subscribedIds.length ? inArray(posts.conversationId, subscribedIds) : sql`false`,
        )!,
      );
    }

    const rankSql =
      tab === "forYou"
        ? sql`(${posts.likeCount} * 2 + ${posts.commentCount} * 3 + (case when ${posts.authorId} = any(${sql.raw(`ARRAY[${followingIds.map((id) => `'${id}'`).join(",") || "NULL"}]::uuid[]`)}) then 25 else 0 end)) desc,`
        : sql``;

    const rows = await db
      .select()
      .from(posts)
      .where(and(...conditions))
      .orderBy(tab === "forYou" ? sql`${rankSql} ${posts.createdAt} desc` : desc(posts.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const payload = await buildPostsPayload(page, user.id);
    return ok({
      posts: payload,
      nextCursor: hasMore ? page[page.length - 1]!.createdAt.toISOString() : null,
      followingCount: followingIds.length,
    });
  } catch (error) {
    return toResponse(error);
  }
}
