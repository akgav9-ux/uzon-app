import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, conversations, media, messages, profiles } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { buildMessagesPayload } from "@/lib/serialize";
import { assertBlockedPair, notifyConversationMembers } from "@/lib/services";
import { messageSendSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function membership(conversationId: string, userId: string) {
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
    await membership(id, user.id);
    const url = new URL(req.url);
    const after = url.searchParams.get("after");
    const before = url.searchParams.get("before");
    const q = url.searchParams.get("q");
    const limit = Math.min(60, Math.max(1, Number(url.searchParams.get("limit") ?? 30)));

    const conditions = [eq(messages.conversationId, id)];
    if (after) conditions.push(gt(messages.createdAt, new Date(after)));
    if (before) conditions.push(sql`${messages.createdAt} < ${new Date(before)}`);
    if (q) conditions.push(sql`${messages.text} ilike ${`%${q.slice(0, 60)}%`}`);

    const rows = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const page = (hasMore ? rows.slice(0, limit) : rows).reverse();
    const payload = await buildMessagesPayload(page, user.id);

    // Mark everything as read for this member once fetched.
    await db.update(conversationMembers).set({ lastReadAt: new Date() }).where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, user.id)));
    return ok({ messages: payload, hasMore, nextCursor: hasMore ? page[0]!.createdAt.toISOString() : null });
  } catch (error) {
    return toResponse(error);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    await rateLimit(`message:${user.id}`, 40, 60);
    const member = await membership(id, user.id);
    const body = await readBody(req, messageSendSchema);

    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conversation) throw new ApiError(404, "not_found", "Conversation not found");

    if (conversation.kind === "channel") {
      if (conversation.onlyAdminsCanPost && member.role !== "owner" && member.role !== "admin") {
        throw new ApiError(403, "no_permission", "Only admins can post in this channel");
      }
    }
    if (!body.text?.trim() && !body.mediaId) throw new ApiError(422, "empty_message", "Message cannot be empty");

    if (conversation.kind === "direct") {
      const [peer] = await db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(and(eq(conversationMembers.conversationId, id), sql`${conversationMembers.userId} <> ${user.id}`))
        .limit(1);
      if (peer) await assertBlockedPair(user.id, peer.userId);
    }

    let mediaRow: typeof media.$inferSelect | undefined;
    if (body.mediaId) {
      const [asset] = await db.select().from(media).where(and(eq(media.id, body.mediaId), eq(media.ownerId, user.id))).limit(1);
      if (!asset) throw new ApiError(403, "forbidden", "You can only attach your own media");
      mediaRow = asset;
    }

    const [row] = await db
      .insert(messages)
      .values({
        conversationId: id,
        senderId: user.id,
        text: body.text?.trim() || null,
        mediaId: mediaRow?.id ?? null,
        attachmentKind: mediaRow?.kind ?? body.attachmentKind ?? null,
        attachmentName: mediaRow?.originalName ?? null,
        attachmentSize: mediaRow?.size ?? null,
        attachmentDurationMs: mediaRow?.durationMs ?? null,
        replyToId: body.replyToId ?? null,
        forwardedFromId: body.forwardedFromId ?? null,
      })
      .returning();

    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, id));
    await db.update(conversationMembers).set({ lastReadAt: new Date() }).where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, user.id)));

    if (conversation.kind !== "channel") {
      await notifyConversationMembers(id, {
        userId: user.id,
        type: "message",
        actorId: user.id,
        entityType: "conversation",
        entityId: id,
        preview: body.text?.slice(0, 80) ?? (mediaRow ? mediaRow.kind : "message"),
        category: "messages",
      });
    }

    const payload = await buildMessagesPayload([row!], user.id);
    void inArray;
    void asc;
    void profiles;
    return ok({ message: payload[0] }, { status: 201 });
  } catch (error) {
    return toResponse(error);
  }
}
