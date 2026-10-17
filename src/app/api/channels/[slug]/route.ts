import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, conversations, posts, profiles } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { ApiError, ok, toResponse } from "@/lib/http";
import { buildPostsPayload } from "@/lib/serialize";
import { mediaSrc } from "@/lib/media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

/** Public channel page: header, subscription state and paginated posts. */
export async function GET(req: Request, { params }: Params) {
  try {
    const viewer = await getSessionUser(req);
    const { slug } = await params;
    const clean = slug.replace(/^@/, "").toLowerCase();
    const [conversation] = await db.select().from(conversations).where(and(eq(conversations.slug, clean), eq(conversations.kind, "channel"))).limit(1);
    if (!conversation) throw new ApiError(404, "not_found", "Channel not found");

    const [member] = viewer
      ? await db.select().from(conversationMembers).where(and(eq(conversationMembers.conversationId, conversation.id), eq(conversationMembers.userId, viewer.id))).limit(1)
      : [];
    if (conversation.isPrivate && !member && viewer?.role === "user") {
      throw new ApiError(403, "forbidden", "This channel is private");
    }

    const [owner] = await db
      .select({ id: profiles.id, username: profiles.username, displayName: profiles.displayName, avatarKey: profiles.avatarKey })
      .from(profiles)
      .where(eq(profiles.id, conversation.ownerId))
      .limit(1);

    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor");
    const conditions = [eq(posts.conversationId, conversation.id), sql`${posts.deletedAt} is null`];
    if (cursor) conditions.push(sql`${posts.createdAt} < ${new Date(cursor)}`);
    const rows = await db.select().from(posts).where(and(...conditions)).orderBy(desc(posts.createdAt)).limit(13);
    const hasMore = rows.length > 12;
    const page = hasMore ? rows.slice(0, 12) : rows;

    const admins = await db
      .select({ userId: conversationMembers.userId, role: conversationMembers.role, username: profiles.username, displayName: profiles.displayName })
      .from(conversationMembers)
      .innerJoin(profiles, eq(profiles.id, conversationMembers.userId))
      .where(and(eq(conversationMembers.conversationId, conversation.id), sql`${conversationMembers.role} in ('owner','admin')`))
      .limit(20);

    return ok({
      channel: {
        id: conversation.id,
        slug: conversation.slug,
        title: conversation.title,
        description: conversation.description,
        avatarUrl: conversation.avatarKey ? mediaSrc({ key: conversation.avatarKey }) : null,
        isPrivate: conversation.isPrivate,
        membersCount: conversation.membersCount,
        onlyAdminsCanPost: conversation.onlyAdminsCanPost,
        createdAt: conversation.createdAt.toISOString(),
        owner: owner ? { id: owner.id, username: owner.username, displayName: owner.displayName, avatarUrl: owner.avatarKey ? mediaSrc({ key: owner.avatarKey }) : null } : null,
        admins,
        myRole: member?.role ?? null,
        subscribed: Boolean(member),
        canPost: Boolean(member && (!conversation.onlyAdminsCanPost || member.role === "owner" || member.role === "admin")),
      },
      posts: await buildPostsPayload(page, viewer?.id ?? null),
      nextCursor: hasMore ? page[page.length - 1]!.createdAt.toISOString() : null,
    });
  } catch (error) {
    return toResponse(error);
  }
}
