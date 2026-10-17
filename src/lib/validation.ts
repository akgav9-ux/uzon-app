import { z } from "zod";
import { SUPPORTED_LOCALES, slugifyChannel, slugifyUsername } from "@/lib/utils";

export const audienceSchema = z.enum(["public", "followers", "contacts", "private"]);
export const privacyRuleSchema = z.enum(["everyone", "followers", "contacts", "selected", "nobody"]);

export const registerSchema = z
  .object({
    username: z.string().min(3).max(30),
    displayName: z.string().min(2).max(60),
    email: z.email().max(180).optional().or(z.literal("")),
    phone: z
      .string()
      .regex(/^\+?[0-9]{6,15}$/, "Enter a valid international number")
      .optional()
      .or(z.literal("")),
    phoneCountry: z.string().max(4).optional(),
    password: z.string().min(8).max(128),
    locale: z.enum(SUPPORTED_LOCALES).optional(),
    theme: z.enum(["dark", "light", "system"]).optional(),
  })
  .refine((v) => Boolean(v.email) || Boolean(v.phone), {
    message: "Provide an email address or a phone number",
    path: ["email"],
  });

export const loginSchema = z.object({
  identifier: z.string().min(3).max(180),
  password: z.string().min(1).max(128),
});

export const recoverRequestSchema = z.object({ identifier: z.string().min(3).max(180) });
export const recoverResetSchema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(8).max(128),
});

export const profileUpdateSchema = z.object({
  displayName: z.string().min(2).max(60).optional(),
  username: z.string().min(3).max(30).optional(),
  bio: z.string().max(400).nullable().optional(),
  links: z.array(z.object({ label: z.string().max(40), url: z.string().max(200) })).max(6).optional(),
  showJoinedDate: z.boolean().optional(),
  isCreator: z.boolean().optional(),
  avatarKey: z.string().max(200).nullable().optional(),
  coverKey: z.string().max(200).nullable().optional(),
});

export const settingsUpdateSchema = z.object({
  theme: z.enum(["dark", "light", "system"]).optional(),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
  autoplay: z.boolean().optional(),
  dataSaver: z.boolean().optional(),
  notifications: z.record(z.string(), z.boolean()).optional(),
});

export const privacyUpdateSchema = z.object({
  phoneVisibility: privacyRuleSchema.optional(),
  findableByPhone: privacyRuleSchema.optional(),
  whoCanMessage: privacyRuleSchema.optional(),
  whoCanCall: privacyRuleSchema.optional(),
  whoCanSeeStories: privacyRuleSchema.optional(),
  whoCanComment: privacyRuleSchema.optional(),
  whoCanTag: privacyRuleSchema.optional(),
  whoCanSeeFollowing: privacyRuleSchema.optional(),
  whoCanSeeActivity: privacyRuleSchema.optional(),
  profileVisibility: z.enum(["public", "private"]).optional(),
});

export const actionSchema = z.object({ action: z.string().min(2).max(40) });

export const postCreateSchema = z.object({
  text: z.string().max(4000).optional(),
  mediaIds: z.array(z.string().uuid()).max(10).optional(),
  audience: audienceSchema.optional(),
  commentsEnabled: z.boolean().optional(),
  conversationId: z.string().uuid().optional(),
  videoId: z.string().uuid().optional(),
});

export const commentCreateSchema = z.object({
  entityType: z.enum(["post", "video"]),
  entityId: z.string().uuid(),
  text: z.string().min(1).max(1000),
  parentId: z.string().uuid().optional(),
});

export const storyCreateSchema = z.object({
  mediaId: z.string().uuid(),
  overlayText: z.string().max(200).optional(),
  caption: z.string().max(400).optional(),
  audience: audienceSchema.optional(),
});

export const messageSendSchema = z.object({
  text: z.string().max(4000).optional(),
  mediaId: z.string().uuid().optional(),
  attachmentKind: z.enum(["image", "video", "audio", "file"]).optional(),
  replyToId: z.string().uuid().optional(),
  forwardedFromId: z.string().uuid().optional(),
});

export const conversationCreateSchema = z.object({
  kind: z.enum(["direct", "group", "channel"]),
  title: z.string().min(2).max(60).optional(),
  description: z.string().max(400).optional(),
  slug: z.string().max(32).optional(),
  isPrivate: z.boolean().optional(),
  memberIds: z.array(z.string().uuid()).max(200).optional(),
});

export const conversationUpdateSchema = z.object({
  title: z.string().min(2).max(60).optional(),
  description: z.string().max(400).nullable().optional(),
  avatarKey: z.string().max(200).nullable().optional(),
  isPrivate: z.boolean().optional(),
  onlyAdminsCanPost: z.boolean().optional(),
  slug: z.string().max(32).nullable().optional(),
});

export const videoCreateSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(4000).optional(),
  category: z.string().max(30).optional(),
  kind: z.enum(["clip", "long"]).optional(),
  mediaId: z.string().uuid(),
  posterKey: z.string().max(200).optional(),
  hashtags: z.array(z.string().max(40)).max(12).optional(),
  durationMs: z.number().int().min(0).max(24 * 3600 * 1000).optional(),
  audience: audienceSchema.optional(),
  commentsEnabled: z.boolean().optional(),
});

export const reportSchema = z.object({
  entityType: z.enum(["user", "message", "post", "video", "channel", "group", "story", "comment"]),
  entityId: z.string().uuid(),
  reason: z.string().min(3).max(60),
  details: z.string().max(1000).optional(),
});

export const playlistSchema = z.object({
  title: z.string().min(2).max(60),
  description: z.string().max(300).optional(),
  isPublic: z.boolean().optional(),
  videoId: z.string().uuid().optional(),
});

export const callCreateSchema = z.object({
  calleeId: z.string().uuid(),
  kind: z.enum(["audio", "video"]),
  conversationId: z.string().uuid().optional(),
});

export const callSignalSchema = z.object({
  type: z.enum(["offer", "answer", "ice", "accept", "decline", "end"]),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export function normalizeUsername(value: string): string {
  const slug = slugifyUsername(value);
  if (slug.length < 3) throw new Error("username_too_short");
  return slug;
}

export function normalizeChannelSlug(value: string): string {
  return slugifyChannel(value);
}
