import { and, desc, eq, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blocks, conversations, posts, profiles, searchHistory, videos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ok, rateLimit, toResponse } from "@/lib/http";
import { buildPostsPayload, buildVideosPayload } from "@/lib/serialize";
import { mediaSrc } from "@/lib/media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TYPES = ["all", "people", "channels", "groups", "clips", "videos", "posts"] as const;

/**
 * Unified search. Private profiles, private channels/groups and non-public
 * posts/videos are excluded at query level, and blocked users are filtered out.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim().slice(0, 60) ?? "";
    const type = (TYPES as readonly string[]).includes(url.searchParams.get("type") ?? "all")
      ? ((url.searchParams.get("type") ?? "all") as (typeof TYPES)[number])
      : "all";
    const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") ?? 8)));

    if (url.searchParams.get("history") === "1") {
      const history = await db
        .select()
        .from(searchHistory)
        .where(eq(searchHistory.userId, user.id))
        .orderBy(desc(searchHistory.searchedAt))
        .limit(12);
      return ok({ history: history.map((h) => ({ query: h.query, searchedAt: h.searchedAt.toISOString() })) });
    }
    if (url.searchParams.get("clearHistory") === "1") {
      await db.delete(searchHistory).where(eq(searchHistory.userId, user.id));
      return ok({ cleared: true });
    }

    await rateLimit(`search:${user.id}`, 120, 60);
    if (q.length < 2) return ok({ query: q, people: [], channels: [], groups: [], clips: [], videos: [], posts: [], history: [] });

    await db
      .insert(searchHistory)
      .values({ userId: user.id, query: q })
      .onConflictDoUpdate({ target: [searchHistory.userId, searchHistory.query], set: { searchedAt: new Date() } });

    const blocked = await db
      .select({ other: sql<string>`case when blocker_id = ${user.id} then blocked_id else blocker_id end` })
      .from(blocks)
      .where(or(eq(blocks.blockerId, user.id), eq(blocks.blockedId, user.id)));
    const blockedIds = blocked.map((b) => b.other).filter(Boolean);

    const like = `%${q.replace(/[%_]/g, "")}%`;
    const isHandle = q.startsWith("@");
    const handle = q.replace(/^@/, "").toLowerCase();

    const wantPeople = type === "all" || type === "people";
    const wantChannels = type === "all" || type === "channels";
    const wantGroups = type === "all" || type === "groups";
    const wantClips = type === "all" || type === "clips";
    const wantVideos = type === "all" || type === "videos";
    const wantPosts = type === "all" || type === "posts";

    const [people, channels, groups, clips, longVideos, publicPosts] = await Promise.all([
      wantPeople
        ? db
            .select()
            .from(profiles)
            .where(
              and(
                sql`${profiles.status} = 'active'`,
                blockedIds.length ? notInArray(profiles.id, blockedIds) : sql`true`,
                isHandle
                  ? sql`${profiles.username} = ${handle}`
                  : or(sql`${profiles.username} ilike ${like}`, sql`${profiles.displayName} ilike ${like}`)!,
              ),
            )
            .limit(limit)
        : Promise.resolve([]),
      wantChannels
        ? db
            .select()
            .from(conversations)
            .where(
              and(
                eq(conversations.kind, "channel"),
                eq(conversations.isPrivate, false),
                or(sql`${conversations.title} ilike ${like}`, sql`${conversations.slug} ilike ${like}`)!,
              ),
            )
            .limit(limit)
        : Promise.resolve([]),
      wantGroups
        ? db
            .select()
            .from(conversations)
            .where(and(eq(conversations.kind, "group"), eq(conversations.isPrivate, false), sql`${conversations.title} ilike ${like}`))
            .limit(limit)
        : Promise.resolve([]),
      wantClips
        ? db
            .select()
            .from(videos)
            .where(
              and(
                eq(videos.kind, "clip"),
                eq(videos.audience, "public"),
                sql`${videos.deletedAt} is null`,
                blockedIds.length ? notInArray(videos.ownerId, blockedIds) : sql`true`,
                or(sql`${videos.title} ilike ${like}`, sql`${videos.hashtags}::text ilike ${like}`)!,
              ),
            )
            .orderBy(desc(videos.viewCount))
            .limit(limit)
        : Promise.resolve([]),
      wantVideos
        ? db
            .select()
            .from(videos)
            .where(
              and(
                eq(videos.kind, "long"),
                eq(videos.audience, "public"),
                sql`${videos.deletedAt} is null`,
                blockedIds.length ? notInArray(videos.ownerId, blockedIds) : sql`true`,
                or(sql`${videos.title} ilike ${like}`, sql`${videos.description} ilike ${like}`)!,
              ),
            )
            .orderBy(desc(videos.viewCount))
            .limit(limit)
        : Promise.resolve([]),
      wantPosts
        ? db
            .select()
            .from(posts)
            .where(
              and(
                eq(posts.audience, "public"),
                sql`${posts.deletedAt} is null`,
                sql`${posts.conversationId} is null`,
                blockedIds.length ? notInArray(posts.authorId, blockedIds) : sql`true`,
                sql`${posts.text} ilike ${like}`,
              ),
            )
            .orderBy(desc(posts.createdAt))
            .limit(limit)
        : Promise.resolve([]),
    ]);

    const privacyRows = people.length
      ? await db.execute(sql`select user_id, profile_visibility from privacy_settings where user_id in (${sql.join(people.map((p) => sql`${p.id}`), sql`, `)})`)
      : { rows: [] as { user_id: string; profile_visibility: string }[] };
    const privateIds = new Set(
      ((privacyRows as unknown as { rows: { user_id: string; profile_visibility: string }[] }).rows ?? []).filter((r) => r.profile_visibility === "private").map((r) => r.user_id),
    );

    return ok({
      query: q,
      people: people
        .filter((p) => !privateIds.has(p.id) || p.username.toLowerCase() === handle)
        .map((p) => ({
          id: p.id,
          username: p.username,
          displayName: p.displayName,
          avatarUrl: p.avatarKey ? mediaSrc({ key: p.avatarKey }) : null,
          bio: privateIds.has(p.id) ? null : p.bio,
          isCreator: p.isCreator,
          followersCount: p.followersCount,
          isPrivate: privateIds.has(p.id),
        })),
      channels: channels.map((c) => ({ id: c.id, slug: c.slug, title: c.title, description: c.description, membersCount: c.membersCount, avatarUrl: c.avatarKey ? mediaSrc({ key: c.avatarKey }) : null })),
      groups: groups.map((c) => ({ id: c.id, title: c.title, description: c.description, membersCount: c.membersCount, avatarUrl: c.avatarKey ? mediaSrc({ key: c.avatarKey }) : null })),
      clips: await buildVideosPayload(clips, user.id),
      videos: await buildVideosPayload(longVideos, user.id),
      posts: await buildPostsPayload(publicPosts, user.id),
    });
  } catch (error) {
    return toResponse(error);
  }
}
