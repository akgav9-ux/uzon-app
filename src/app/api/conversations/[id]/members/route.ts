import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversationMembers, conversations, profiles } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { notify } from "@/lib/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), userIds: z.array(z.string().uuid()).min(1).max(100) }),
  z.object({ action: z.literal("remove"), userIds: z.array(z.string().uuid()).min(1).max(100) }),
  z.object({ action: z.literal("role"), userId: z.string().uuid(), role: z.enum(["admin", "member", "subscriber"]) }),
  z.object({ action: z.literal("leave") }),
  z.object({ action: z.literal("join") }),
  z.object({ action: z.literal("mute"), muted: z.boolean() }),
]);

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const body = await readBody(req, schema);
    await rateLimit(`members:${user.id}`, 60, 300);

    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conversation) throw new ApiError(404, "not_found", "Conversation not found");
    const [member] = await db
      .select()
      .from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, user.id)))
      .limit(1);

    const isManager = member && (member.role === "owner" || member.role === "admin");

    if (body.action === "join") {
      if (conversation.isPrivate && conversation.kind === "channel" && !isManager) {
        throw new ApiError(403, "forbidden", "This channel is private");
      }
      await db
        .insert(conversationMembers)
        .values({ conversationId: id, userId: user.id, role: conversation.kind === "channel" ? "subscriber" : "member" })
        .onConflictDoNothing();
      await db.update(conversations).set({ membersCount: sql`${conversations.membersCount} + 1` }).where(eq(conversations.id, id));
      return ok({ joined: true });
    }

    if (body.action === "leave") {
      if (!member) throw new ApiError(404, "not_a_member", "You are not a member");
      if (member.role === "owner" && conversation.kind !== "direct") {
        throw new ApiError(422, "owner_cannot_leave", "Transfer ownership or delete the conversation instead");
      }
      await db.delete(conversationMembers).where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, user.id)));
      await db.update(conversations).set({ membersCount: sql`greatest(0, ${conversations.membersCount} - 1)` }).where(eq(conversations.id, id));
      return ok({ left: true });
    }

    if (body.action === "mute") {
      if (!member) throw new ApiError(404, "not_a_member");
      await db.update(conversationMembers).set({ muted: body.muted }).where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, user.id)));
      return ok({ muted: body.muted });
    }

    if (!member) throw new ApiError(403, "not_a_member", "You are not a member of this conversation");
    if (conversation.kind === "direct") throw new ApiError(422, "not_supported", "Direct chats have fixed members");
    if (!isManager && user.role === "user") throw new ApiError(403, "forbidden", "Only admins can manage members");

    if (body.action === "add") {
      const valid = await db.select({ id: profiles.id }).from(profiles).where(inArrayUuids(body.userIds));
      for (const row of valid) {
        await db
          .insert(conversationMembers)
          .values({ conversationId: id, userId: row.id, role: conversation.kind === "channel" ? "subscriber" : "member" })
          .onConflictDoNothing();
        await notify({
          userId: row.id,
          type: "invite",
          actorId: user.id,
          entityType: conversation.kind,
          entityId: id,
          preview: conversation.title ?? "UZON",
          category: "invites",
        });
      }
      await db.update(conversations).set({ membersCount: sql`${conversations.membersCount} + ${valid.length}` }).where(eq(conversations.id, id));
      return ok({ added: valid.length });
    }

    if (body.action === "remove") {
      let removed = 0;
      for (const userId of body.userIds) {
        const [target] = await db
          .select()
          .from(conversationMembers)
          .where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, userId)))
          .limit(1);
        if (!target) continue;
        if (target.role === "owner") throw new ApiError(403, "forbidden", "The owner cannot be removed");
        if (target.role === "admin" && member.role !== "owner" && user.role === "user") {
          throw new ApiError(403, "forbidden", "Only the owner can remove admins");
        }
        await db.delete(conversationMembers).where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, userId)));
        removed += 1;
      }
      await db.update(conversations).set({ membersCount: sql`greatest(0, ${conversations.membersCount} - ${removed})` }).where(eq(conversations.id, id));
      return ok({ removed });
    }

    // role change
    const [target] = await db
      .select()
      .from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, body.userId)))
      .limit(1);
    if (!target) throw new ApiError(404, "not_a_member", "That user is not a member");
    if (target.role === "owner") throw new ApiError(403, "forbidden", "The owner role cannot be changed");
    if (member.role !== "owner" && user.role === "user") throw new ApiError(403, "forbidden", "Only the owner can change roles");
    await db.update(conversationMembers).set({ role: body.role }).where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, body.userId)));
    return ok({ role: body.role });
  } catch (error) {
    return toResponse(error);
  }
}

function inArrayUuids(ids: string[]) {
  return inArray(profiles.id, ids);
}
