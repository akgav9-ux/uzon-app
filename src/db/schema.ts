import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const now = sql`now()`;

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    phoneCountry: text("phone_country"),
    /** SHA-256 of the normalised number, used for privacy-preserving contact matching. */
    phoneHash: text("phone_hash"),
    passwordHash: text("password_hash"), // Не notNull, чтобы Google-пользователи могли входить без пароля
    googleId: text("google_id"), // <-- Добавлено для входа через Google
    avatarKey: text("avatar_key"),
    coverKey: text("cover_key"),
    bio: text("bio"),
    links: jsonb("links").$type<{ label: string; url: string }[]>().default([]),
    role: text("role").notNull().default("user"), // user | moderator | admin
    isCreator: boolean("is_creator").notNull().default(false),
    status: text("status").notNull().default("active"), // active | suspended | deleted
    showJoinedDate: boolean("show_joined_date").notNull().default(true),
    emailVerified: boolean("email_verified").notNull().default(false),
    phoneVerified: boolean("phone_verified").notNull().default(false),
    followersCount: integer("followers_count").notNull().default(0),
    followingCount: integer("following_count").notNull().default(0),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("profiles_username_uidx").on(t.username),
    uniqueIndex("profiles_email_uidx").on(t.email),
    uniqueIndex("profiles_phone_uidx").on(t.phone),
    uniqueIndex("profiles_google_id_uidx").on(t.googleId), // <-- Уникальный индекс для Google ID
    index("profiles_role_idx").on(t.role),
  ],
);

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  theme: text("theme").notNull().default("system"), // dark | light | system
  locale: text("locale").notNull().default("ru"), // ru | en | uz-Latn
  autoplay: boolean("autoplay").notNull().default(true),
  dataSaver: boolean("data_saver").notNull().default(false),
  notifications: jsonb("notifications")
    .$type<Record<string, boolean>>()
    .default({
      messages: true,
      replies: true,
      mentions: true,
      follows: true,
      comments: true,
      reactions: true,
      invites: true,
      calls: true,
      processing: true,
    }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const privacySettings = pgTable("privacy_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  phoneVisibility: text("phone_visibility").notNull().default("nobody"),
  findableByPhone: text("findable_by_phone").notNull().default("contacts"),
  whoCanMessage: text("who_can_message").notNull().default("everyone"),
  whoCanCall: text("who_can_call").notNull().default("contacts"),
  whoCanSeeStories: text("who_can_see_stories").notNull().default("everyone"),
  whoCanComment: text("who_can_comment").notNull().default("everyone"),
  whoCanTag: text("who_can_tag").notNull().default("contacts"),
  whoCanSeeFollowing: text("who_can_see_following").notNull().default("everyone"),
  whoCanSeeActivity: text("who_can_see_activity").notNull().default("contacts"),
  profileVisibility: text("profile_visibility").notNull().default("public"), // public | private
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Explicit allow-lists used when a privacy rule is set to "selected". */
export const privacySelected = pgTable(
  "privacy_selected",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(), // phoneVisibility | whoCanCall | stories | ...
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.targetId, t.scope] })],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("sessions_token_hash_uidx").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const verificationCodes = pgTable(
  "verification_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(), // email | phone
    destination: text("destination").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [index("verification_codes_user_idx").on(t.userId)],
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [index("password_resets_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* Social graph                                                        */
/* ------------------------------------------------------------------ */

export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    followingId: uuid("following_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followingId] }),
    index("follows_following_idx").on(t.followingId),
  ],
);

export const blocks = pgTable(
  "blocks",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

/**
 * Address-book entries are stored minimised: only a SHA-256 hash of the
 * international number plus the user supplied label. Raw numbers never leave
 * the device unless the user explicitly invites someone.
 */
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    phoneHash: text("phone_hash").notNull(),
    label: text("label"),
    matchedUserId: uuid("matched_user_id").references(() => profiles.id, { onDelete: "set null" }),
    invited: boolean("invited").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("contacts_owner_hash_uidx").on(t.ownerId, t.phoneHash)],
);

/* ------------------------------------------------------------------ */
/* Conversations: direct chats, groups and channels                    */
/* ------------------------------------------------------------------ */

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(), // direct | group | channel
    title: text("title"),
    description: text("description"),
    avatarKey: text("avatar_key"),
    slug: text("slug"),
    isPrivate: boolean("is_private").notNull().default(false),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    onlyAdminsCanPost: boolean("only_admins_can_post").notNull().default(false),
    pinnedMessageId: uuid("pinned_message_id"),
    discussionId: uuid("discussion_id"),
    membersCount: integer("members_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("conversations_slug_uidx").on(t.slug), index("conversations_owner_idx").on(t.ownerId)],
);

export const conversationMembers = pgTable(
  "conversation_members",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // owner | admin | member | subscriber
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
    muted: boolean("muted").notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    index("conversation_members_user_idx").on(t.userId),
  ],
);

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    /** Absolute URL when the asset lives in an external store (demo CDN, S3 public URL). */
    remoteUrl: text("remote_url"),
    mime: text("mime").notNull(),
    kind: text("kind").notNull(), // image | video | audio | file
    size: bigint("size", { mode: "number" }).notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    originalName: text("original_name"),
    visibility: text("visibility").notNull().default("public"),
    status: text("status").notNull().default("ready"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("media_key_uidx").on(t.key), index("media_owner_idx").on(t.ownerId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    text: text("text"),
    replyToId: uuid("reply_to_id"),
    forwardedFromId: uuid("forwarded_from_id"),
    mediaId: uuid("media_id").references(() => media.id, { onDelete: "set null" }),
    attachmentKind: text("attachment_kind"), // image | video | audio | file
    attachmentName: text("attachment_name"),
    attachmentSize: integer("attachment_size"),
    attachmentDurationMs: integer("attachment_duration_ms"),
    pinned: boolean("pinned").notNull().default(false),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_conversation_created_idx").on(t.conversationId, t.createdAt),
    index("messages_sender_idx").on(t.senderId),
  ],
);

export const messageReactions = pgTable(
  "message_reactions",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] })],
);

export const messageReads = pgTable(
  "message_reads",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId] })],
);

/* ------------------------------------------------------------------ */
/* Content: posts, stories, videos                                     */
/* ------------------------------------------------------------------ */

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
    text: text("text"),
    kind: text("kind").notNull().default("text"), // text | photo | album | clip | video
    audience: text("audience").notNull().default("public"), // public | followers | contacts | private
    videoId: uuid("video_id"),
    commentsEnabled: boolean("comments_enabled").notNull().default(true),
    likeCount: integer("like_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("posts_author_created_idx").on(t.authorId, t.createdAt),
    index("posts_created_idx").on(t.createdAt),
    index("posts_conversation_idx").on(t.conversationId),
  ],
);

export const postMedia = pgTable(
  "post_media",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.postId, t.mediaId] })],
);

export const stories = pgTable(
  "stories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id").references(() => media.id, { onDelete: "cascade" }),
    overlayText: text("overlay_text"),
    caption: text("caption"),
    audience: text("audience").notNull().default("public"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("stories_user_expires_idx").on(t.userId, t.expiresAt)],
);

export const storyViews = pgTable(
  "story_views",
  {
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    viewerId: uuid("viewer_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.storyId, t.viewerId] })],
);

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category").notNull().default("blogs"),
    kind: text("kind").notNull().default("long"), // clip | long
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    posterKey: text("poster_key"),
    hashtags: jsonb("hashtags").$type<string[]>().default([]),
    durationMs: integer("duration_ms"),
    audience: text("audience").notNull().default("public"),
    commentsEnabled: boolean("comments_enabled").notNull().default(true),
    status: text("status").notNull().default("processing"), // processing | ready | failed
    processingNote: text("processing_note"),
    viewCount: integer("view_count").notNull().default(0),
    likeCount: integer("like_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("videos_kind_created_idx").on(t.kind, t.createdAt),
    index("videos_owner_idx").on(t.ownerId),
    index("videos_category_idx").on(t.category),
  ],
);

export const videoJobs = pgTable(
  "video_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    stage: text("stage").notNull().default("queued"), // queued | probing | thumbnail | transcode | done | failed
    status: text("status").notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("video_jobs_video_idx").on(t.videoId)],
);

export const videoProgress = pgTable(
  "video_progress",
  {
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    positionMs: integer("position_ms").notNull().default(0),
    watchMs: integer("watch_ms").notNull().default(0),
    completions: integer("completions").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.videoId, t.userId] })],
);

export const watchHistory = pgTable(
  "watch_history",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    positionMs: integer("position_ms").notNull().default(0),
    watchedAt: timestamp("watched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.videoId] }), index("watch_history_user_idx").on(t.userId, t.watchedAt)],
);

export const playlists = pgTable(
  "playlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    kind: text("kind").notNull().default("playlist"), // playlist | watch_later
    isPublic: boolean("is_public").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("playlists_owner_idx").on(t.ownerId), index("playlists_owner_kind_idx").on(t.ownerId, t.kind)],
);

export const playlistItems = pgTable(
  "playlist_items",
  {
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.playlistId, t.videoId] })],
);

/* ------------------------------------------------------------------ */
/* Engagement                                                          */
/* ------------------------------------------------------------------ */

export const likes = pgTable(
  "likes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(), // post | video | comment
    entityId: uuid("entity_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("likes_entity_user_uidx").on(t.entityType, t.entityId, t.userId)],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(), // post | video
    entityId: uuid("entity_id").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    text: text("text").notNull(),
    likeCount: integer("like_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("comments_entity_idx").on(t.entityType, t.entityId, t.createdAt)],
);

export const savedItems = pgTable(
  "saved_items",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entityType, t.entityId] })],
);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(), // video | post | channel
    entityId: uuid("entity_id").notNull(),
    ownerId: uuid("owner_id").notNull(),
    type: text("type").notNull(), // view | like | comment | follow | unfollow
    actorId: uuid("actor_id"),
    source: text("source").notNull().default("direct"),
    watchMs: integer("watch_ms").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("analytics_owner_created_idx").on(t.ownerId, t.createdAt),
    index("analytics_entity_idx").on(t.entityType, t.entityId),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "cascade" }),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    preview: text("preview"),
    groupKey: text("group_key"),
    groupCount: integer("group_count").notNull().default(1),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_created_idx").on(t.userId, t.createdAt)],
);

export const searchHistory = pgTable(
  "search_history",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    searchedAt: timestamp("searched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.query] })],
);

/* ------------------------------------------------------------------ */
/* Calls (WebRTC signalling)                                           */
/* ------------------------------------------------------------------ */

export const calls = pgTable(
  "calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
    initiatorId: uuid("initiator_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    calleeId: uuid("callee_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("audio"), // audio | video
    status: text("status").notNull().default("ringing"), // ringing | active | ended | missed | declined | failed
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endedReason: text("ended_reason"),
    durationMs: integer("duration_ms").notNull().default(0),
  },
  (t) => [index("calls_participants_idx").on(t.initiatorId, t.calleeId, t.createdAt)],
);

export const callSignals = pgTable(
  "call_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    callId: uuid("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // offer | answer | ice | accept | decline | end
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => [index("call_signals_call_idx").on(t.callId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Safety & moderation                                                 */
/* ------------------------------------------------------------------ */

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(), // user | message | post | video | group | channel | story | comment
    entityId: uuid("entity_id").notNull(),
    reason: text("reason").notNull(),
    details: text("details"),
    status: text("status").notNull().default("open"), // open | reviewing | resolved | dismissed
    handledBy: uuid("handled_by").references(() => profiles.id, { onDelete: "set null" }),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    resolution: text("resolution"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reports_status_idx").on(t.status, t.createdAt)],
);

export const moderationActions = pgTable(
  "moderation_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moderatorId: uuid("moderator_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    action: text("action").notNull(), // resolve | dismiss | remove_content | suspend | restore | grant_role
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("moderation_actions_created_idx").on(t.createdAt)],
);

/** Server-owned runtime configuration (clip length limits, upload limits...). */
export const appConfig = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    points: integer("points").notNull().default(0),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const demoAccounts = pgTable("demo_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  role: text("role").notNull().default("user"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(now),
});