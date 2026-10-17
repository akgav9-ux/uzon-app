import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversations, conversationMembers, messageReactions, messageReads, messages } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { notify } from "@/lib/services";
import { buildMessagesPayload } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), text: z.string().min(1).max(4000) }),
  z.object({ action: z.literal("react"), emoji: z.string().min(1).max(8) }),
  z.object({ action: z.literal("pin") }),
  z.object({ action: z.literal("unpin") }),
  z.object({ action: z.literal("read") }),
  z.object({ action: z.literal("mute") }),
]);

async function loadMessage(id: string) {
  const [row] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  if (!row) throw new ApiError(404, "not_found", "Message not found");
  return row;
}

async function assertMember(conversationId: string, userId: string) {
  const [member] = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .limit(1);
  if (!member) throw new ApiError(403, "not_a_member", "You are not a member of this conversation");
  return member;
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const body = await readBody(req, patchSchema);
    const message = await loadMessage(id);
    const member = await assertMember(message.conversationId, user.id);
    await rateLimit(`message-action:${user.id}`, 200, 60);
    const isStaff = user.role === "admin" || user.role === "moderator";

    if (body.action === "edit") {
      if (message.senderId !== user.id) throw new ApiError(403, "forbidden", "You can only edit your own messages");
      if (message.deletedAt) throw new ApiError(410, "gone", "Message deleted");
      const [updated] = await db
        .update(messages)
        .set({ text: body.text.trim(), editedAt: new Date() })
        .where(eq(messages.id, id))
        .returning();
      return ok({ message: (await buildMessagesPayload([updated!], user.id))[0] });
    }

    if (body.action === "react") {
      const existing = await db
        .select()
        .from(messageReactions)
        .where(and(eq(messageReactions.messageId, id), eq(messageReactions.userId, user.id), eq(messageReactions.emoji, body.emoji)))
        .limit(1);
      if (existing[0]) {
        await db
          .delete(messageReactions)
          .where(
            and(
              eq(messageReactions.messageId, id),
              eq(messageReactions.userId, user.id),
              eq(messageReactions.emoji, body.emoji),
            ),
          );
      } else {
        await db.insert(messageReactions).values({ messageId: id, userId: user.id, emoji: body.emoji });
        if (message.senderId !== user.id) {
          await notify({
            userId: message.senderId,
            type: "reaction",
            actorId: user.id,
            entityType: "message",
            entityId: id,
            preview: body.emoji,
            category: "reactions",
          });
        }
      }
      const reactions = await db.select().from(messageReactions).where(eq(messageReactions.messageId, id));
      return ok({ reactions });
    }

    if (body.action === "pin" || body.action === "unpin") {
      if (member.role !== "owner" && member.role !== "admin" && !isStaff) {
        throw new ApiError(403, "forbidden", "Only admins can pin messages");
      }
      const pinned = body.action === "pin";
      await db.update(messages).set({ pinned }).where(eq(messages.id, id));
      if (pinned) {
        await db.update(conversations).set({ pinnedMessageId: id }).where(eq(conversations.id, message.conversationId));
      } else {
        await db
          .update(conversations)
          .set({ pinnedMessageId: null })
          .where(and(eq(conversations.id, message.conversationId), eq(conversations.pinnedMessageId, id)));
      }
      return ok({ pinned });
    }

    if (body.action === "mute") {
      await db.update(conversationMembers).set({ muted: true }).where(and(eq(conversationMembers.conversationId, message.conversationId), eq(conversationMembers.userId, user.id)));
      return ok({ muted: true });
    }

    // read receipt — only recorded when the client actually rendered the message.
    await db.insert(messageReads).values({ messageId: id, userId: user.id }).onConflictDoNothing();
    await db.update(conversationMembers).set({ lastReadAt: new Date() }).where(and(eq(conversationMembers.conversationId, message.conversationId), eq(conversationMembers.userId, user.id)));
    const readCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messageReads)
      .where(eq(messageReads.messageId, id));
    return ok({ read: true, readBy: readCount[0]?.count ?? 0 });
  } catch (error) {
    return toResponse(error);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const message = await loadMessage(id);
    await assertMember(message.conversationId, user.id);
    const isStaff = user.role === "admin" || user.role === "moderator";
    if (message.senderId !== user.id && !isStaff) throw new ApiError(403, "forbidden", "You can only delete your own messages");
    await db.update(messages).set({ deletedAt: new Date(), text: null }).where(eq(messages.id, id));
    return ok({ deleted: true });
  } catch (error) {
    return toResponse(error);
  }
}
