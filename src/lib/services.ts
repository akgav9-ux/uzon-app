import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsEvents,
  blocks,
  comments,
  contacts,
  conversationMembers,
  conversations,
  follows,
  likes,
  notifications,
  posts,
  privacySelected,
  privacySettings,
  profiles,
  userSettings,
  videos,
} from "@/db/schema";
import type { RelationContext } from "@/lib/access";
import { ApiError } from "@/lib/http";
import { getServerConfig } from "@/lib/config";

/** Builds the relation context used by every visibility decision. */
export async function getRelation(viewerId: string | null, ownerId: string, scope = "default"): Promise<RelationContext> {
  const isOwner = Boolean(viewerId && viewerId === ownerId);
  const ctx: RelationContext = {
    viewerId,
    ownerId,
    isOwner,
    viewerFollowsOwner: false,
    ownerFollowsViewer: false,
    isContact: false,
    isSelected: false,
    blocked: false,
    isStaff: false,
  };
  if (!viewerId) return ctx;
  if (isOwner) return ctx;

  const [followRow, reverseFollow, blockRow, blockReverse, contactRow, selectedRow, viewerRow] = await Promise.all([
    db
      .select({ one: sql`1` })
      .from(follows)
      .where(and(eq(follows.followerId, viewerId), eq(follows.followingId, ownerId)))
      .limit(1),
    db
      .select({ one: sql`1` })
      .from(follows)
      .where(and(eq(follows.followerId, ownerId), eq(follows.followingId, viewerId)))
      .limit(1),
    db
      .select({ one: sql`1` })
      .from(blocks)
      .where(and(eq(blocks.blockerId, ownerId), eq(blocks.blockedId, viewerId)))
      .limit(1),
    db
      .select({ one: sql`1` })
      .from(blocks)
      .where(and(eq(blocks.blockerId, viewerId), eq(blocks.blockedId, ownerId)))
      .limit(1),
    db
      .select({ one: sql`1` })
      .from(contacts)
      .where(and(eq(contacts.ownerId, ownerId), eq(contacts.matchedUserId, viewerId)))
      .limit(1),
    db
      .select({ one: sql`1` })
      .from(privacySelected)
      .where(and(eq(privacySelected.userId, ownerId), eq(privacySelected.targetId, viewerId), eq(privacySelected.scope, scope)))
      .limit(1),
    db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, viewerId)).limit(1),
  ]);

  ctx.viewerFollowsOwner = followRow.length > 0;
  ctx.ownerFollowsViewer = reverseFollow.length > 0;
  ctx.blocked = blockRow.length > 0 || blockReverse.length > 0;
  ctx.isContact = contactRow.length > 0;
  ctx.isSelected = selectedRow.length > 0;
  ctx.isStaff = viewerRow[0]?.role === "admin" || viewerRow[0]?.role === "moderator";
  return ctx;
}

export async function getPrivacy(userId: string) {
  const rows = await db.select().from(privacySettings).where(eq(privacySettings.userId, userId)).limit(1);
  return rows[0];
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export async function notify(opts: {
  userId: string;
  type: string;
  actorId?: string | null;
  entityType?: string;
  entityId?: string;
  preview?: string;
  category?: string;
}): Promise<void> {
  if (opts.userId === opts.actorId) return;
  const category = opts.category ?? opts.type;
  const [target] = await db.select({ status: profiles.status }).from(profiles).where(eq(profiles.id, opts.userId)).limit(1);
  if (target?.status === "suspended") return;
  const [settings] = await db
    .select({ notifications: userSettings.notifications })
    .from(userSettings)
    .where(eq(userSettings.userId, opts.userId))
    .limit(1);
  const prefs = (settings?.notifications ?? {}) as Record<string, boolean>;
  if (prefs[category] === false) return;

  const groupKey = `${opts.type}:${opts.entityType ?? "-"}:${opts.entityId ?? "-"}`;
  const existing = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, opts.userId),
        eq(notifications.groupKey, groupKey),
        sql`${notifications.readAt} is null`,
        sql`${notifications.createdAt} > now() - interval '1 hour'`,
      ),
    )
    .limit(1);
  if (existing[0]) {
    await db
      .update(notifications)
      .set({
        groupCount: existing[0].groupCount + 1,
        actorId: opts.actorId ?? existing[0].actorId,
        preview: opts.preview ?? existing[0].preview,
        createdAt: new Date(),
      })
      .where(eq(notifications.id, existing[0].id));
    return;
  }
  await db.insert(notifications).values({
    userId: opts.userId,
    type: opts.type,
    actorId: opts.actorId ?? null,
    entityType: opts.entityType ?? null,
    entityId: opts.entityId ?? null,
    preview: opts.preview?.slice(0, 160) ?? null,
    groupKey,
  });
  void category;
}

export async function notifyConversationMembers(conversationId: string, opts: Parameters<typeof notify>[0]) {
  const members = await db
    .select({ userId: conversationMembers.userId, muted: conversationMembers.muted })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));
  await Promise.all(
    members
      .filter((m) => !m.muted && m.userId !== opts.actorId)
      .map((m) => notify({ ...opts, userId: m.userId })),
  );
}

/* ------------------------------------------------------------------ */
/* Likes, comments, saves                                              */
/* ------------------------------------------------------------------ */

export async function toggleLike(opts: {
  entityType: "post" | "video" | "comment";
  entityId: string;
  userId: string;
  source?: string;
}): Promise<{ liked: boolean; likeCount: number }> {
  const existing = await db
    .select()
    .from(likes)
    .where(and(eq(likes.entityType, opts.entityType), eq(likes.entityId, opts.entityId), eq(likes.userId, opts.userId)))
    .limit(1);
  let liked: boolean;
  if (existing[0]) {
    await db.delete(likes).where(eq(likes.id, existing[0].id));
    liked = false;
  } else {
    await db.insert(likes).values({ entityType: opts.entityType, entityId: opts.entityId, userId: opts.userId });
    liked = true;
  }
  const delta = liked ? 1 : -1;
  let likeCount = 0;
  let ownerId: string | null = null;
  if (opts.entityType === "post") {
    const row = await db
      .update(posts)
      .set({ likeCount: sql`greatest(0, ${posts.likeCount} + ${delta})` })
      .where(eq(posts.id, opts.entityId))
      .returning({ likeCount: posts.likeCount, owner: posts.authorId });
    likeCount = row[0]?.likeCount ?? 0;
    ownerId = row[0]?.owner ?? null;
  } else if (opts.entityType === "video") {
    const row = await db
      .update(videos)
      .set({ likeCount: sql`greatest(0, ${videos.likeCount} + ${delta})` })
      .where(eq(videos.id, opts.entityId))
      .returning({ likeCount: videos.likeCount, owner: videos.ownerId });
    likeCount = row[0]?.likeCount ?? 0;
    ownerId = row[0]?.owner ?? null;
  } else {
    const row = await db
      .update(comments)
      .set({ likeCount: sql`greatest(0, ${comments.likeCount} + ${delta})` })
      .where(eq(comments.id, opts.entityId))
      .returning({ likeCount: comments.likeCount, owner: comments.authorId });
    likeCount = row[0]?.likeCount ?? 0;
    ownerId = row[0]?.owner ?? null;
  }

  if (ownerId && liked) {
    await db.insert(analyticsEvents).values({
      entityType: opts.entityType,
      entityId: opts.entityId,
      ownerId,
      type: "like",
      actorId: opts.userId,
      source: opts.source ?? "direct",
    });
    const actor = await db.select({ username: profiles.username }).from(profiles).where(eq(profiles.id, opts.userId)).limit(1);
    await notify({
      userId: ownerId,
      type: "like",
      actorId: opts.userId,
      entityType: opts.entityType,
      entityId: opts.entityId,
      preview: actor[0]?.username,
    });
  }
  return { liked, likeCount };
}

/**
 * Registers a view with an explicit anti-inflation rule: the viewer must watch
 * at least `viewRegisterMs`, and the same viewer can only add one view per
 * video per `viewCooldownMinutes`.
 */
export async function registerView(opts: {
  videoId: string;
  viewerId: string | null;
  source: string;
  watchMs: number;
}): Promise<{ counted: boolean; viewCount: number }> {
  const config = await getServerConfig();
  const video = await db.select().from(videos).where(eq(videos.id, opts.videoId)).limit(1);
  const current = video[0];
  if (!current || current.deletedAt) throw new ApiError(404, "not_found", "Video not found");
  if (opts.watchMs < config.viewRegisterMs) return { counted: false, viewCount: current.viewCount };

  if (opts.viewerId) {
    if (opts.viewerId === current.ownerId) return { counted: false, viewCount: current.viewCount };
    const cooldown = await db
      .select({ id: analyticsEvents.id })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.entityType, "video"),
          eq(analyticsEvents.entityId, opts.videoId),
          eq(analyticsEvents.type, "view"),
          eq(analyticsEvents.actorId, opts.viewerId),
          sql`${analyticsEvents.createdAt} > now() - (${config.viewCooldownMinutes} || ' minutes')::interval`,
        ),
      )
      .limit(1);
    if (cooldown[0]) return { counted: false, viewCount: current.viewCount };
  }

  await db.insert(analyticsEvents).values({
    entityType: "video",
    entityId: opts.videoId,
    ownerId: current.ownerId,
    type: "view",
    actorId: opts.viewerId,
    source: opts.source,
    watchMs: opts.watchMs,
  });
  const updated = await db
    .update(videos)
    .set({ viewCount: sql`${videos.viewCount} + 1` })
    .where(eq(videos.id, opts.videoId))
    .returning({ viewCount: videos.viewCount });
  return { counted: true, viewCount: updated[0]?.viewCount ?? current.viewCount + 1 };
}

export async function bumpCommentCount(entityType: "post" | "video", entityId: string, delta: number) {
  if (entityType === "post") {
    await db
      .update(posts)
      .set({ commentCount: sql`greatest(0, ${posts.commentCount} + ${delta})` })
      .where(eq(posts.id, entityId));
    const row = await db.select({ authorId: posts.authorId }).from(posts).where(eq(posts.id, entityId)).limit(1);
    return row[0]?.authorId ?? null;
  }
  await db
    .update(videos)
    .set({ commentCount: sql`greatest(0, ${videos.commentCount} + ${delta})` })
    .where(eq(videos.id, entityId));
  const row = await db.select({ ownerId: videos.ownerId }).from(videos).where(eq(videos.id, entityId)).limit(1);
  return row[0]?.ownerId ?? null;
}

export async function assertMember(conversationId: string, userId: string) {
  const row = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .limit(1);
  if (!row[0]) throw new ApiError(403, "not_a_member", "You are not a member of this conversation");
  return row[0];
}

export async function assertBlockedPair(a: string, b: string) {
  const row = await db
    .select({ one: sql`1` })
    .from(blocks)
    .where(
      sql`(${blocks.blockerId} = ${a} and ${blocks.blockedId} = ${b}) or (${blocks.blockerId} = ${b} and ${blocks.blockedId} = ${a})`,
    )
    .limit(1);
  if (row[0]) throw new ApiError(403, "blocked", "You cannot interact with this user");
}

export async function conversationTitle(conversationId: string): Promise<string | null> {
  const row = await db.select({ title: conversations.title }).from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  return row[0]?.title ?? null;
}
