import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { posts, savedItems, videos, watchHistory } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ok, toResponse } from "@/lib/http";
import { buildPostsPayload, buildVideosPayload } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const url = new URL(req.url);
    const type = url.searchParams.get("type") ?? "saved";

    if (type === "history") {
      const rows = await db
        .select({ video: videos, watchedAt: watchHistory.watchedAt, positionMs: watchHistory.positionMs })
        .from(watchHistory)
        .innerJoin(videos, eq(videos.id, watchHistory.videoId))
        .where(and(eq(watchHistory.userId, user.id), sql`${videos.deletedAt} is null`))
        .orderBy(desc(watchHistory.watchedAt))
        .limit(40);
      return ok({ history: await buildVideosPayload(rows.map((r) => r.video), user.id) });
    }

    const saved = await db
      .select()
      .from(savedItems)
      .where(eq(savedItems.userId, user.id))
      .orderBy(desc(savedItems.createdAt))
      .limit(60);

    const postIds = saved.filter((s) => s.entityType === "post").map((s) => s.entityId);
    const videoIds = saved.filter((s) => s.entityType === "video").map((s) => s.entityId);
    const [postRows, videoRows] = await Promise.all([
      postIds.length
        ? db.select().from(posts).where(and(inArray(posts.id, postIds), sql`${posts.deletedAt} is null`))
        : Promise.resolve([]),
      videoIds.length
        ? db.select().from(videos).where(and(inArray(videos.id, videoIds), sql`${videos.deletedAt} is null`))
        : Promise.resolve([]),
    ]);

    return ok({
      posts: await buildPostsPayload(postRows, user.id),
      videos: await buildVideosPayload(videoRows, user.id),
    });
  } catch (error) {
    return toResponse(error);
  }
}
