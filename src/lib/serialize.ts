import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  conversationMembers,
  conversations,
  likes,
  media,
  messageReactions,
  messageReads,
  messages,
  posts,
  postMedia,
  profiles,
  savedItems,
  stories,
  storyViews,
  videos,
  videoProgress,
  follows,
} from "@/db/schema";
import { mediaSrc } from "@/lib/media";

type AuthorLite = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isCreator: boolean;
};

async function authorsByIds(ids: string[]): Promise<Record<string, AuthorLite>> {
  if (!ids.length) return {};
  const rows = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
      avatarKey: profiles.avatarKey,
      isCreator: profiles.isCreator,
    })
    .from(profiles)
    .where(inArray(profiles.id, Array.from(new Set(ids))));
  const out: Record<string, AuthorLite> = {};
  for (const row of rows) {
    out[row.id] = { ...row, avatarUrl: mediaSrc({ key: row.avatarKey ?? "" }) ?? null };
  }
  return out;
}

const emptyAuthor: AuthorLite = { id: "", username: "unknown", displayName: "Unknown", avatarUrl: null, isCreator: false };

export type PostPayload = {
  id: string;
  text: string | null;
  kind: string;
  audience: string;
  author: AuthorLite;
  conversation: { id: string; title: string | null; slug: string | null; kind: string } | null;
  media: { id: string; url: string; kind: string; width: number | null; height: number | null; durationMs: number | null }[];
  video: VideoPayload | null;
  likeCount: number;
  commentCount: number;
  likedByViewer: boolean;
  savedByViewer: boolean;
  commentsEnabled: boolean;
  createdAt: string;
  isMine: boolean;
};

export type VideoPayload = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  kind: string;
  url: string | null;
  posterUrl: string | null;
  hashtags: string[];
  durationMs: number | null;
  status: string;
  processingNote: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  likedByViewer: boolean;
  savedByViewer: boolean;
  commentsEnabled: boolean;
  audience: string;
  owner: AuthorLite;
  positionMs: number;
  createdAt: string;
  isMine: boolean;
};

export async function buildVideosPayload(rows: (typeof videos.$inferSelect)[], viewerId: string | null): Promise<VideoPayload[]> {
  if (!rows.length) return [];
  const videoIds = rows.map((r) => r.id);
  const mediaIds = rows.map((r) => r.mediaId).filter(Boolean);
  const posterKeys = rows.map((r) => r.posterKey).filter((k): k is string => Boolean(k));

  const [mediaRows, ownerMap, likedRows, savedRows, progressRows, posterRows] = await Promise.all([
    mediaIds.length ? db.select().from(media).where(inArray(media.id, mediaIds)) : Promise.resolve([]),
    authorsByIds(rows.map((r) => r.ownerId)),
    viewerId
      ? db
          .select({ entityId: likes.entityId })
          .from(likes)
          .where(and(eq(likes.entityType, "video"), eq(likes.userId, viewerId), inArray(likes.entityId, videoIds)))
      : Promise.resolve([]),
    viewerId
      ? db
          .select({ entityId: savedItems.entityId })
          .from(savedItems)
          .where(and(eq(savedItems.entityType, "video"), eq(savedItems.userId, viewerId), inArray(savedItems.entityId, videoIds)))
      : Promise.resolve([]),
    viewerId
      ? db
          .select({ videoId: videoProgress.videoId, positionMs: videoProgress.positionMs })
          .from(videoProgress)
          .where(and(eq(videoProgress.userId, viewerId), inArray(videoProgress.videoId, videoIds)))
      : Promise.resolve([]),
    posterKeys.length
      ? db.select({ key: media.key, remoteUrl: media.remoteUrl }).from(media).where(inArray(media.key, posterKeys))
      : Promise.resolve([]),
  ]);

  const mediaMap = new Map(mediaRows.map((m) => [m.id, m]));
  const liked = new Set(likedRows.map((r) => r.entityId));
  const saved = new Set(savedRows.map((r) => r.entityId));
  const progressMap = new Map(progressRows.map((p) => [p.videoId, p.positionMs]));
  const posterMap = new Map(posterRows.map((p) => [p.key, mediaSrc(p)]));

  return rows.map((row) => {
    const m = mediaMap.get(row.mediaId);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      kind: row.kind,
      url: mediaSrc(m ?? null),
      posterUrl: row.posterKey ? (posterMap.get(row.posterKey) ?? null) : null,
      hashtags: (row.hashtags ?? []) as string[],
      durationMs: row.durationMs,
      status: row.status,
      processingNote: row.processingNote,
      viewCount: row.viewCount,
      likeCount: row.likeCount,
      commentCount: row.commentCount,
      likedByViewer: liked.has(row.id),
      savedByViewer: saved.has(row.id),
      commentsEnabled: row.commentsEnabled,
      audience: row.audience,
      owner: ownerMap[row.ownerId] ?? emptyAuthor,
      positionMs: progressMap.get(row.id) ?? 0,
      createdAt: row.createdAt.toISOString(),
      isMine: viewerId === row.ownerId,
    };
  });
}

export async function buildPostsPayload(rows: (typeof posts.$inferSelect)[], viewerId: string | null): Promise<PostPayload[]> {
  if (!rows.length) return [];
  const postIds = rows.map((r) => r.id);
  const conversationIds = rows.map((r) => r.conversationId).filter((c): c is string => Boolean(c));
  const videoIds = rows.map((r) => r.videoId).filter((v): v is string => Boolean(v));

  const [mediaLinks, ownerMap, likedRows, savedRows, convRows, videoRows] = await Promise.all([
    db
      .select({ postId: postMedia.postId, media: media })
      .from(postMedia)
      .innerJoin(media, eq(media.id, postMedia.mediaId))
      .where(inArray(postMedia.postId, postIds))
      .orderBy(postMedia.position),
    authorsByIds(rows.map((r) => r.authorId)),
    viewerId
      ? db
          .select({ entityId: likes.entityId })
          .from(likes)
          .where(and(eq(likes.entityType, "post"), eq(likes.userId, viewerId), inArray(likes.entityId, postIds)))
      : Promise.resolve([]),
    viewerId
      ? db
          .select({ entityId: savedItems.entityId })
          .from(savedItems)
          .where(and(eq(savedItems.entityType, "post"), eq(savedItems.userId, viewerId), inArray(savedItems.entityId, postIds)))
      : Promise.resolve([]),
    conversationIds.length
      ? db
          .select({ id: conversations.id, title: conversations.title, slug: conversations.slug, kind: conversations.kind })
          .from(conversations)
          .where(inArray(conversations.id, conversationIds))
      : Promise.resolve([]),
    videoIds.length ? db.select().from(videos).where(inArray(videos.id, videoIds)) : Promise.resolve([]),
  ]);

  const mediaByPost = new Map<string, PostPayload["media"]>();
  for (const link of mediaLinks) {
    const list = mediaByPost.get(link.postId) ?? [];
    list.push({
      id: link.media.id,
      url: mediaSrc(link.media) ?? "",
      kind: link.media.kind,
      width: link.media.width,
      height: link.media.height,
      durationMs: link.media.durationMs,
    });
    mediaByPost.set(link.postId, list);
  }
  const liked = new Set(likedRows.map((r) => r.entityId));
  const saved = new Set(savedRows.map((r) => r.entityId));
  const convMap = new Map(convRows.map((c) => [c.id, c]));
  const videoPayloads = new Map(
    (await buildVideosPayload(videoRows, viewerId)).map((v) => [v.id, v]),
  );

  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    kind: row.kind,
    audience: row.audience,
    author: ownerMap[row.authorId] ?? emptyAuthor,
    conversation: row.conversationId ? (convMap.get(row.conversationId) ?? null) : null,
    media: mediaByPost.get(row.id) ?? [],
    video: row.videoId ? (videoPayloads.get(row.videoId) ?? null) : null,
    likeCount: row.likeCount,
    commentCount: row.commentCount,
    likedByViewer: liked.has(row.id),
    savedByViewer: saved.has(row.id),
    commentsEnabled: row.commentsEnabled,
    createdAt: row.createdAt.toISOString(),
    isMine: viewerId === row.authorId,
  }));
}

export type MessagePayload = {
  id: string;
  conversationId: string;
  text: string | null;
  sender: AuthorLite;
  media: { url: string; kind: string; name?: string | null; size?: number | null; durationMs?: number | null } | null;
  replyTo: { id: string; text: string | null; senderName: string } | null;
  reactions: { emoji: string; userIds: string[] }[];
  readBy: number;
  pinned: boolean;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  isMine: boolean;
  status: "sent" | "delivered" | "read";
};

export async function buildMessagesPayload(rows: (typeof messages.$inferSelect)[], viewerId: string): Promise<MessagePayload[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const replyIds = rows.map((r) => r.replyToId).filter((r): r is string => Boolean(r));
  const mediaIds = rows.map((r) => r.mediaId).filter((r): r is string => Boolean(r));

  const [authorMap, reactionRows, readRows, replyRows, mediaRows] = await Promise.all([
    authorsByIds(rows.map((r) => r.senderId)),
    db.select().from(messageReactions).where(inArray(messageReactions.messageId, ids)),
    db.select({ messageId: messageReads.messageId, count: sql<number>`count(*)::int` }).from(messageReads).where(inArray(messageReads.messageId, ids)).groupBy(messageReads.messageId),
    replyIds.length
      ? db
          .select({ id: messages.id, text: messages.text, senderId: messages.senderId })
          .from(messages)
          .where(inArray(messages.id, replyIds))
      : Promise.resolve([]),
    mediaIds.length ? db.select().from(media).where(inArray(media.id, mediaIds)) : Promise.resolve([]),
  ]);

  const reactionsByMessage = new Map<string, Map<string, string[]>>();
  for (const reaction of reactionRows) {
    const map = reactionsByMessage.get(reaction.messageId) ?? new Map();
    map.set(reaction.emoji, [...(map.get(reaction.emoji) ?? []), reaction.userId]);
    reactionsByMessage.set(reaction.messageId, map);
  }
  const readMap = new Map(readRows.map((r) => [r.messageId, r.count]));
  const replyMap = new Map(replyRows.map((r) => [r.id, r]));
  const mediaMap = new Map(mediaRows.map((m) => [m.id, m]));

  return rows.map((row) => {
    const m = row.mediaId ? mediaMap.get(row.mediaId) : undefined;
    const reply = row.replyToId ? replyMap.get(row.replyToId) : undefined;
    const readBy = readMap.get(row.id) ?? 0;
    return {
      id: row.id,
      conversationId: row.conversationId,
      text: row.deletedAt ? null : row.text,
      sender: authorMap[row.senderId] ?? emptyAuthor,
      media: m ? { url: mediaSrc(m) ?? "", kind: m.kind, size: m.size, durationMs: m.durationMs, name: m.originalName } : null,
      replyTo: reply
        ? { id: reply.id, text: reply.text?.slice(0, 120) ?? null, senderName: authorMap[reply.senderId]?.displayName ?? "UZON" }
        : null,
      reactions: Array.from(reactionsByMessage.get(row.id)?.entries() ?? []).map(([emoji, userIds]) => ({ emoji, userIds })),
      readBy,
      pinned: row.pinned,
      editedAt: row.editedAt?.toISOString() ?? null,
      deletedAt: row.deletedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      isMine: row.senderId === viewerId,
      status: row.senderId === viewerId ? (readBy > 0 ? "read" : "sent") : "delivered",
    };
  });
}

export type ConversationPayload = {
  id: string;
  kind: string;
  title: string | null;
  slug: string | null;
  description: string | null;
  avatarUrl: string | null;
  peer: AuthorLite | null;
  membersCount: number;
  myRole: string;
  lastMessage: MessagePayload | null;
  unread: number;
  isPrivate: boolean;
  onlyAdminsCanPost: boolean;
  updatedAt: string;
  muted: boolean;
};

export async function buildConversationsPayload(
  memberships: { conversation: typeof conversations.$inferSelect; member: typeof conversationMembers.$inferSelect }[],
  viewerId: string,
): Promise<ConversationPayload[]> {
  if (!memberships.length) return [];
  const convIds = memberships.map((m) => m.conversation.id);

  const [lastMessages, memberRows, directMembers, readCounts] = await Promise.all([
    db
      .select({ conversationId: messages.conversationId, message: messages })
      .from(messages)
      .where(and(inArray(messages.conversationId, convIds), sql`${messages.deletedAt} is null`))
      .orderBy(desc(messages.createdAt))
      .limit(400),
    db
      .select({ conversationId: conversationMembers.conversationId, userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(inArray(conversationMembers.conversationId, convIds)),
    db
      .select({ conversationId: conversationMembers.conversationId, userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(and(inArray(conversationMembers.conversationId, convIds), sql`${conversationMembers.userId} <> ${viewerId}`)),
    db
      .select({ conversationId: conversationMembers.conversationId, lastReadAt: conversationMembers.lastReadAt })
      .from(conversationMembers)
      .where(and(eq(conversationMembers.userId, viewerId), inArray(conversationMembers.conversationId, convIds))),
  ]);

  const lastByConv = new Map<string, typeof messages.$inferSelect>();
  for (const row of lastMessages) {
    if (!lastByConv.has(row.conversationId)) lastByConv.set(row.conversationId, row.message);
  }
  const membersByConv = new Map<string, number>();
  for (const row of memberRows) membersByConv.set(row.conversationId, (membersByConv.get(row.conversationId) ?? 0) + 1);
  const peersByConv = new Map<string, string[]>();
  for (const row of directMembers) peersByConv.set(row.conversationId, [...(peersByConv.get(row.conversationId) ?? []), row.userId]);
  const readMap = new Map(readCounts.map((r) => [r.conversationId, r.lastReadAt]));

  const peerIds = memberships.filter((m) => m.conversation.kind === "direct").flatMap((m) => peersByConv.get(m.conversation.id) ?? []);
  const authors = await authorsByIds(peerIds);
  const lastPayloads = await buildMessagesPayload(
    Array.from(lastByConv.values()).filter((m) => m.senderId !== viewerId || true),
    viewerId,
  );
  const lastPayloadMap = new Map(lastPayloads.map((m) => [m.id, m]));
  const unreadRows = await db
    .select({ conversationId: messages.conversationId, count: sql<number>`count(*)::int` })
    .from(messages)
    .where(inArray(messages.conversationId, convIds))
    .groupBy(messages.conversationId);
  void unreadRows;

  return memberships.map(({ conversation, member }) => {
    const last = lastByConv.get(conversation.id);
    const peerId = conversation.kind === "direct" ? (peersByConv.get(conversation.id)?.[0] ?? null) : null;
    const lastRead = readMap.get(conversation.id);
    const unread = last && lastRead && last.createdAt > lastRead && last.senderId !== viewerId ? 1 : 0;
    return {
      id: conversation.id,
      kind: conversation.kind,
      title: conversation.title ?? (peerId ? (authors[peerId]?.displayName ?? null) : null),
      slug: conversation.slug,
      description: conversation.description,
      avatarUrl: conversation.avatarKey ? mediaSrc({ key: conversation.avatarKey }) : (peerId ? (authors[peerId]?.avatarUrl ?? null) : null),
      peer: peerId ? (authors[peerId] ?? null) : null,
      membersCount: membersByConv.get(conversation.id) ?? conversation.membersCount,
      myRole: member.role,
      lastMessage: last ? (lastPayloadMap.get(last.id) ?? null) : null,
      unread,
      isPrivate: conversation.isPrivate,
      onlyAdminsCanPost: conversation.onlyAdminsCanPost,
      updatedAt: (last?.createdAt ?? conversation.updatedAt).toISOString(),
      muted: member.muted,
    };
  });
}

export async function buildStoryPayload(rows: (typeof stories.$inferSelect)[], viewerId: string | null) {
  if (!rows.length) return [];
  const mediaIds = rows.map((r) => r.mediaId).filter((v): v is string => Boolean(v));
  const storyIds = rows.map((r) => r.id);
  const [mediaRows, authorMap, viewCounts, myViews] = await Promise.all([
    mediaIds.length ? db.select().from(media).where(inArray(media.id, mediaIds)) : Promise.resolve([]),
    authorsByIds(rows.map((r) => r.userId)),
    db
      .select({ storyId: storyViews.storyId, count: sql<number>`count(*)::int` })
      .from(storyViews)
      .where(inArray(storyViews.storyId, storyIds))
      .groupBy(storyViews.storyId),
    viewerId
      ? db.select({ storyId: storyViews.storyId }).from(storyViews).where(and(eq(storyViews.viewerId, viewerId), inArray(storyViews.storyId, storyIds)))
      : Promise.resolve([]),
  ]);
  const mediaMap = new Map(mediaRows.map((m) => [m.id, m]));
  const countMap = new Map(viewCounts.map((v) => [v.storyId, v.count]));
  const seen = new Set(myViews.map((v) => v.storyId));
  return rows.map((row) => {
    const m = row.mediaId ? mediaMap.get(row.mediaId) : undefined;
    return {
      id: row.id,
      userId: row.userId,
      author: authorMap[row.userId] ?? emptyAuthor,
      mediaUrl: mediaSrc(m ?? null),
      mediaKind: m?.kind ?? "image",
      caption: row.caption,
      overlayText: row.overlayText,
      audience: row.audience,
      viewCount: countMap.get(row.id) ?? 0,
      seenByViewer: seen.has(row.id),
      isMine: viewerId === row.userId,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    };
  });
}

export async function isFollowing(viewerId: string | null, targetId: string): Promise<boolean> {
  if (!viewerId || viewerId === targetId) return false;
  const row = await db
    .select({ one: sql`1` })
    .from(follows)
    .where(and(eq(follows.followerId, viewerId), eq(follows.followingId, targetId)))
    .limit(1);
  return row.length > 0;
}
