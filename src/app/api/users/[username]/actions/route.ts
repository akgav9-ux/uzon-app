import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { analyticsEvents, blocks, conversationMembers, conversations, follows, privacySettings, profiles } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { assertBlockedPair, getRelation, notify } from "@/lib/services";
import { canDirectMessage } from "@/lib/access";
import { buildConversationsPayload } from "@/lib/serialize";
import type { PrivacyRule } from "@/lib/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ username: string }> };

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("follow") }),
  z.object({ action: z.literal("unfollow") }),
  z.object({ action: z.literal("block") }),
  z.object({ action: z.literal("unblock") }),
  z.object({ action: z.literal("message") }),
  z.object({ action: z.literal("call"), kind: z.enum(["audio", "video"]) }),
]);

async function target(username: string) {
  const [row] = await db.select().from(profiles).where(eq(profiles.username, username.replace(/^@/, "").toLowerCase())).limit(1);
  if (!row || row.status === "deleted") throw new ApiError(404, "not_found", "User not found");
  return row;
}

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { username } = await params;
    const body = await readBody(req, schema);
    const row = await target(username);
    if (row.id === user.id) throw new ApiError(422, "self_action", "You cannot do this to your own account");
    await rateLimit(`user-action:${user.id}`, 60, 60);

    if (body.action === "follow") {
      await assertBlockedPair(user.id, row.id);
      const [privacy] = await db.select().from(privacySettings).where(eq(privacySettings.userId, row.id)).limit(1);
      void privacy;
      await db
        .insert(follows)
        .values({ followerId: user.id, followingId: row.id })
        .onConflictDoNothing();
      await db.update(profiles).set({ followersCount: sql`${profiles.followersCount} + 1` }).where(eq(profiles.id, row.id));
      await db.update(profiles).set({ followingCount: sql`${profiles.followingCount} + 1` }).where(eq(profiles.id, user.id));
      await db.insert(analyticsEvents).values({
        entityType: "channel",
        entityId: row.id,
        ownerId: row.id,
        type: "follow",
        actorId: user.id,
        source: "profile",
      });
      await notify({ userId: row.id, type: "follow", actorId: user.id, entityType: "user", entityId: user.id, preview: user.username, category: "follows" });
      return ok({ following: true });
    }

    if (body.action === "unfollow") {
      const deleted = await db
        .delete(follows)
        .where(and(eq(follows.followerId, user.id), eq(follows.followingId, row.id)))
        .returning({ followerId: follows.followerId });
      if (deleted.length) {
        await db.update(profiles).set({ followersCount: sql`greatest(0, ${profiles.followersCount} - 1)` }).where(eq(profiles.id, row.id));
        await db.update(profiles).set({ followingCount: sql`greatest(0, ${profiles.followingCount} - 1)` }).where(eq(profiles.id, user.id));
        await db.insert(analyticsEvents).values({
          entityType: "channel",
          entityId: row.id,
          ownerId: row.id,
          type: "unfollow",
          actorId: user.id,
          source: "profile",
        });
      }
      return ok({ following: false });
    }

    if (body.action === "block") {
      await db.insert(blocks).values({ blockerId: user.id, blockedId: row.id }).onConflictDoNothing();
      await db.delete(follows).where(or(and(eq(follows.followerId, user.id), eq(follows.followingId, row.id)), and(eq(follows.followerId, row.id), eq(follows.followingId, user.id))));
      return ok({ blocked: true });
    }

    if (body.action === "unblock") {
      await db.delete(blocks).where(and(eq(blocks.blockerId, user.id), eq(blocks.blockedId, row.id)));
      return ok({ blocked: false });
    }

    if (body.action === "call") {
      const [privacy] = await db.select().from(privacySettings).where(eq(privacySettings.userId, row.id)).limit(1);
      const ctx = await getRelation(user.id, row.id, "whoCanCall");
      if (!canDirectMessage((privacy?.whoCanCall ?? "contacts") as PrivacyRule, ctx)) {
        throw new ApiError(403, "calls_restricted", "This user only accepts calls from selected people");
      }
      return ok({ canCall: true, kind: body.kind });
    }

    // message — reuse an existing direct conversation or create one.
    const [privacy] = await db.select().from(privacySettings).where(eq(privacySettings.userId, row.id)).limit(1);
    const ctx = await getRelation(user.id, row.id, "whoCanMessage");
    await assertBlockedPair(user.id, row.id);
    if (!canDirectMessage((privacy?.whoCanMessage ?? "everyone") as PrivacyRule, ctx)) {
      throw new ApiError(403, "messages_restricted", "This user only accepts messages from selected people");
    }

    const [existingConv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .innerJoin(conversationMembers, eq(conversationMembers.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.kind, "direct"),
          sql`exists (select 1 from conversation_members cm where cm.conversation_id = ${conversations.id} and cm.user_id = ${row.id})`,
          eq(conversationMembers.userId, user.id),
        ),
      )
      .limit(1);

    let conversationId = existingConv?.id;
    if (!conversationId) {
      const [created] = await db.insert(conversations).values({ kind: "direct", ownerId: user.id }).returning({ id: conversations.id });
      conversationId = created!.id;
      await db.insert(conversationMembers).values([
        { conversationId, userId: user.id, role: "member" },
        { conversationId, userId: row.id, role: "member" },
      ]);
      await db.update(conversations).set({ membersCount: 2 }).where(eq(conversations.id, conversationId));
    }

    const [membership] = await db
      .select({ conversation: conversations, member: conversationMembers })
      .from(conversations)
      .innerJoin(conversationMembers, eq(conversationMembers.conversationId, conversations.id))
      .where(and(eq(conversations.id, conversationId), eq(conversationMembers.userId, user.id)))
      .limit(1);
    const payload = await buildConversationsPayload([membership!], user.id);
    return ok({ conversation: payload[0], conversationId }, { status: 201 });
  } catch (error) {
    return toResponse(error);
  }
}
