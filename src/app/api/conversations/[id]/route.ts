import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, conversations, profiles } from "@/db/schema";
import { getSessionUser, requireUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { buildConversationsPayload } from "@/lib/serialize";
import { mediaSrc } from "@/lib/media";
import { normalizeChannelSlug } from "@/lib/validation";
import { conversationUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function assertMembership(conversationId: string, userId: string) {
  const [member] = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .limit(1);
  if (!member) throw new ApiError(403, "not_a_member", "You are not a member of this conversation");
  return member;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conversation) throw new ApiError(404, "not_found", "Conversation not found");
    const member = await assertMembership(id, user.id);

    const members = await db
      .select({
        userId: conversationMembers.userId,
        role: conversationMembers.role,
        joinedAt: conversationMembers.joinedAt,
        username: profiles.username,
        displayName: profiles.displayName,
        avatarKey: profiles.avatarKey,
        lastSeenAt: profiles.lastSeenAt,
      })
      .from(conversationMembers)
      .innerJoin(profiles, eq(profiles.id, conversationMembers.userId))
      .where(eq(conversationMembers.conversationId, id))
      .orderBy(desc(conversationMembers.role))
      .limit(300);

    const rows = await db
      .select({ conversation: conversations, member: conversationMembers })
      .from(conversationMembers)
      .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
      .where(and(eq(conversations.id, id), eq(conversationMembers.userId, user.id)))
      .limit(1);

    await db.update(conversationMembers).set({ lastReadAt: new Date() }).where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, user.id)));

    return ok({
      conversation: (await buildConversationsPayload(rows, user.id))[0],
      myRole: member.role,
      pinnedMessageId: conversation.pinnedMessageId,
      discussionId: conversation.discussionId,
      members: members.map((m) => ({
        userId: m.userId,
        username: m.username,
        displayName: m.displayName,
        avatarUrl: m.avatarKey ? mediaSrc({ key: m.avatarKey }) : null,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
        lastSeenAt: m.lastSeenAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    return toResponse(error);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const member = await assertMembership(id, user.id);
    if (member.role !== "owner" && member.role !== "admin" && user.role === "user") {
      throw new ApiError(403, "forbidden", "Only owners and admins can change these settings");
    }
    const body = await readBody(req, conversationUpdateSchema);
    if (body.slug) {
      const slug = normalizeChannelSlug(body.slug);
      const clash = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.slug, slug), sql`${conversations.id} <> ${id}`))
        .limit(1);
      if (clash[0]) throw new ApiError(409, "slug_taken", "That public address is already taken");
      body.slug = slug;
    }
    const [updated] = await db
      .update(conversations)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return ok({ conversation: updated });
  } catch (error) {
    return toResponse(error);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const member = await assertMembership(id, user.id);
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conversation) throw new ApiError(404, "not_found");
    if (conversation.kind === "direct") throw new ApiError(422, "not_supported", "Direct chats cannot be deleted, only left");

    if (conversation.ownerId === user.id || user.role !== "user") {
      await rateLimit(`delete-conversation:${user.id}`, 5, 3600);
      await db.delete(conversations).where(eq(conversations.id, id));
      return ok({ deleted: true });
    }
    if (member.role === "owner") throw new ApiError(403, "forbidden");
    await db.delete(conversationMembers).where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, user.id)));
    await db.update(conversations).set({ membersCount: sql`greatest(0, ${conversations.membersCount} - 1)` }).where(eq(conversations.id, id));
    return ok({ left: true });
  } catch (error) {
    return toResponse(error);
  }
}

export { inArray };
