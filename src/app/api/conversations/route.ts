import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, conversations, profiles } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { buildConversationsPayload } from "@/lib/serialize";
import { assertBlockedPair, notify } from "@/lib/services";
import { normalizeChannelSlug } from "@/lib/validation";
import { conversationCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind");
    const conditions = [eq(conversationMembers.userId, user.id)];
    if (kind && ["direct", "group", "channel"].includes(kind)) conditions.push(eq(conversations.kind, kind));

    const rows = await db
      .select({ conversation: conversations, member: conversationMembers })
      .from(conversationMembers)
      .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
      .where(and(...conditions))
      .orderBy(desc(conversations.updatedAt))
      .limit(100);

    const payload = await buildConversationsPayload(rows, user.id);
    const requests = payload.filter((c) => c.kind === "direct" && c.unread > 0).length;
    return ok({ conversations: payload.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), requests });
  } catch (error) {
    return toResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await rateLimit(`conversation:${user.id}`, 20, 600);
    const body = await readBody(req, conversationCreateSchema);

    if (body.kind === "direct") {
      const peerId = body.memberIds?.[0];
      if (!peerId) throw new ApiError(422, "missing_member", "Choose a person to message");
      const [peer] = await db.select().from(profiles).where(eq(profiles.id, peerId)).limit(1);
      if (!peer) throw new ApiError(404, "not_found", "User not found");
      await assertBlockedPair(user.id, peerId);
      const [existing] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .innerJoin(conversationMembers, eq(conversationMembers.conversationId, conversations.id))
        .where(
          and(
            eq(conversations.kind, "direct"),
            eq(conversationMembers.userId, user.id),
            sql`exists (select 1 from conversation_members cm where cm.conversation_id = ${conversations.id} and cm.user_id = ${peerId})`,
          ),
        )
        .limit(1);
      const conversationId =
        existing?.id ??
        (
          await db.insert(conversations).values({ kind: "direct", ownerId: user.id }).returning({ id: conversations.id })
        )[0]!.id;
      if (!existing) {
        await db.insert(conversationMembers).values([
          { conversationId, userId: user.id, role: "member" },
          { conversationId, userId: peerId, role: "member" },
        ]);
        await db.update(conversations).set({ membersCount: 2 }).where(eq(conversations.id, conversationId));
      }
      const rows = await db
        .select({ conversation: conversations, member: conversationMembers })
        .from(conversationMembers)
        .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
        .where(and(eq(conversations.id, conversationId), eq(conversationMembers.userId, user.id)))
        .limit(1);
      return ok({ conversation: (await buildConversationsPayload(rows, user.id))[0] }, { status: 201 });
    }

    const isChannel = body.kind === "channel";
    const title = body.title?.trim();
    if (!title) throw new ApiError(422, "missing_title", isChannel ? "Channel name is required" : "Group name is required");
    let slug: string | null = null;
    if (isChannel && !body.isPrivate) {
      slug = normalizeChannelSlug(body.slug || title);
      if (slug.length < 3) throw new ApiError(422, "invalid_slug", "Public address must be at least 3 characters");
      const clash = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.slug, slug)).limit(1);
      if (clash[0]) throw new ApiError(409, "slug_taken", "That public address is already taken");
    }

    const [created] = await db
      .insert(conversations)
      .values({
        kind: body.kind,
        title,
        description: body.description?.trim() ?? null,
        slug,
        isPrivate: body.isPrivate ?? false,
        ownerId: user.id,
        onlyAdminsCanPost: isChannel,
        membersCount: 1 + (body.memberIds?.length ?? 0),
      })
      .returning({ id: conversations.id });

    await db.insert(conversationMembers).values({ conversationId: created!.id, userId: user.id, role: "owner" });
    for (const memberId of body.memberIds ?? []) {
      if (memberId === user.id) continue;
      await db
        .insert(conversationMembers)
        .values({ conversationId: created!.id, userId: memberId, role: isChannel ? "subscriber" : "member" })
        .onConflictDoNothing();
      await notify({
        userId: memberId,
        type: "invite",
        actorId: user.id,
        entityType: body.kind,
        entityId: created!.id,
        preview: title,
        category: "invites",
      });
    }

    const rows = await db
      .select({ conversation: conversations, member: conversationMembers })
      .from(conversationMembers)
      .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
      .where(and(eq(conversations.id, created!.id), eq(conversationMembers.userId, user.id)))
      .limit(1);
    return ok({ conversation: (await buildConversationsPayload(rows, user.id))[0] }, { status: 201 });
  } catch (error) {
    return toResponse(error);
  }
}


