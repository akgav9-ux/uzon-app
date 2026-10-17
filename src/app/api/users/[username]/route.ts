import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { blocks, contacts, conversations, conversationMembers, follows, privacySettings, profiles, userSettings } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { ApiError, ok, toResponse } from "@/lib/http";
import { evaluatePrivacyRule, parsePrivacyRule, type PrivacyRule } from "@/lib/access";
import { getRelation } from "@/lib/services";
import { mediaSrc } from "@/lib/media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ username: string }> };

/**
 * Public profile payload. The phone number is only included when the owner's
 * `phoneVisibility` rule explicitly allows it for the requesting user.
 */
export async function GET(req: Request, { params }: Params) {
  try {
    const { username } = await params;
    const viewer = await getSessionUser(req);
    const clean = username.replace(/^@/, "").toLowerCase();
    const [row] = await db.select().from(profiles).where(eq(profiles.username, clean)).limit(1);
    if (!row || row.status === "deleted") throw new ApiError(404, "not_found", "User not found");

    const isSelf = viewer?.id === row.id;
    const ctx = viewer ? await getRelation(viewer.id, row.id) : null;
    const [privacy] = await db.select().from(privacySettings).where(eq(privacySettings.userId, row.id)).limit(1);
    const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, row.id)).limit(1);
    const isPrivateProfile = (privacy?.profileVisibility ?? "public") === "private";
    const restricted = isPrivateProfile && !isSelf && !ctx?.viewerFollowsOwner && !ctx?.isStaff;

    const phoneRule = parsePrivacyRule(privacy?.phoneVisibility ?? "nobody");
    const showPhone = isSelf
      ? true
      : ctx
        ? evaluatePrivacyRule(phoneRule, { ...ctx, isSelected: false })
        : false;
    const activityRule = parsePrivacyRule(privacy?.whoCanSeeActivity ?? "contacts");
    const showActivity = isSelf || (ctx ? evaluatePrivacyRule(activityRule, ctx) : false);

    const [channel] = await db
      .select({ id: conversations.id, slug: conversations.slug, title: conversations.title, membersCount: conversations.membersCount })
      .from(conversations)
      .where(and(eq(conversations.ownerId, row.id), eq(conversations.kind, "channel")))
      .orderBy(desc(conversations.createdAt))
      .limit(1);

    const counts = await db
      .select({
        posts: sql<number>`(select count(*)::int from posts where author_id = ${row.id} and deleted_at is null${restricted ? sql` and audience = 'public'` : sql``})`,
        clips: sql<number>`(select count(*)::int from videos where owner_id = ${row.id} and kind = 'clip' and deleted_at is null)`,
        videos: sql<number>`(select count(*)::int from videos where owner_id = ${row.id} and kind = 'long' and deleted_at is null)`,
      })
      .from(profiles)
      .where(eq(profiles.id, row.id))
      .limit(1);

    let blocked = false;
    let isContact = false;
    if (viewer && !isSelf) {
      const [blockRow] = await db
        .select()
        .from(blocks)
        .where(and(eq(blocks.blockerId, viewer.id), eq(blocks.blockedId, row.id)))
        .limit(1);
      blocked = Boolean(blockRow);
      const [contactRow] = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.ownerId, viewer.id), eq(contacts.matchedUserId, row.id)))
        .limit(1);
      isContact = Boolean(contactRow);
    }

    return ok({
      profile: {
        id: row.id,
        username: row.username,
        displayName: row.displayName,
        avatarUrl: row.avatarKey ? mediaSrc({ key: row.avatarKey }) : null,
        coverUrl: row.coverKey ? mediaSrc({ key: row.coverKey }) : null,
        bio: restricted ? null : row.bio,
        links: restricted ? [] : ((row.links ?? []) as { label: string; url: string }[]),
        role: row.role,
        isCreator: row.isCreator,
        followersCount: row.followersCount,
        followingCount: row.followingCount,
        createdAt: row.showJoinedDate ? row.createdAt.toISOString() : null,
        lastSeenAt: showActivity ? (row.lastSeenAt?.toISOString() ?? null) : null,
        phone: showPhone ? row.phone : null,
        email: isSelf ? row.email : null,
        isPrivate: isPrivateProfile,
        restricted,
        isSelf,
        isFollowing: ctx?.viewerFollowsOwner ?? false,
        followsYou: ctx?.ownerFollowsViewer ?? false,
        blocked,
        isContact,
        counts: counts[0] ?? { posts: 0, clips: 0, videos: 0 },
        channel: channel ?? null,
        locale: isSelf ? (settings?.locale ?? "ru") : undefined,
        verifiedEmail: isSelf ? row.emailVerified : undefined,
        verifiedPhone: isSelf ? row.phoneVerified : undefined,
      },
      privacy: isSelf ? privacy : { profileVisibility: privacy?.profileVisibility ?? "public" },
    });
  } catch (error) {
    return toResponse(error);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const viewer = await getSessionUser(req);
    const { username } = await params;
    if (!viewer) throw new ApiError(401, "unauthenticated");
    if (viewer.username !== username && viewer.role === "user") throw new ApiError(403, "forbidden");
    await db.update(profiles).set({ status: "suspended" }).where(eq(profiles.username, username));
    await db.delete(conversationMembers).where(sql`user_id in (select id from profiles where username = ${username})`);
    const [row] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.username, username)).limit(1);
    if (row) await db.delete(follows).where(sql`${follows.followerId} = ${row.id} or ${follows.followingId} = ${row.id}`);
    return ok({ suspended: true });
  } catch (error) {
    return toResponse(error);
  }
}
