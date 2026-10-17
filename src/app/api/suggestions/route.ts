import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations, follows, profiles, videos } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { ok, toResponse } from "@/lib/http";
import { mediaSrc } from "@/lib/media";
import { buildVideosPayload } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** People and channels to follow, plus trending clips for the right rail. */
export async function GET(req: Request) {
  try {
    const viewer = await getSessionUser(req);
    const followingIds = viewer
      ? (await db.select({ followingId: follows.followingId }).from(follows).where(eq(follows.followerId, viewer.id))).map((r) => r.followingId)
      : [];

    const peopleConditions = [sql`${profiles.status} = 'active'`];
    if (viewer) peopleConditions.push(sql`${profiles.id} <> ${viewer.id}`);
    if (followingIds.length) peopleConditions.push(notInArray(profiles.id, followingIds));

    const [people, channels, trending] = await Promise.all([
      db.select().from(profiles).where(and(...peopleConditions)).orderBy(desc(profiles.followersCount)).limit(6),
      db
        .select()
        .from(conversations)
        .where(and(eq(conversations.kind, "channel"), eq(conversations.isPrivate, false)))
        .orderBy(desc(conversations.membersCount))
        .limit(5),
      db
        .select()
        .from(videos)
        .where(and(eq(videos.kind, "clip"), eq(videos.audience, "public"), sql`${videos.deletedAt} is null`, eq(videos.status, "ready")))
        .orderBy(desc(videos.viewCount))
        .limit(4),
    ]);

    return ok({
      people: people.map((p) => ({
        id: p.id,
        username: p.username,
        displayName: p.displayName,
        avatarUrl: p.avatarKey ? mediaSrc({ key: p.avatarKey }) : null,
        bio: p.bio,
        followersCount: p.followersCount,
        isCreator: p.isCreator,
      })),
      channels: channels.map((c) => ({
        id: c.id,
        slug: c.slug,
        title: c.title,
        description: c.description,
        membersCount: c.membersCount,
        avatarUrl: c.avatarKey ? mediaSrc({ key: c.avatarKey }) : null,
      })),
      trending: await buildVideosPayload(trending, viewer?.id ?? null),
    });
  } catch (error) {
    return toResponse(error);
  }
}
