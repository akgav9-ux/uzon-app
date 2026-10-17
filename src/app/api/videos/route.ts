import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blocks, follows, media, videos, videoJobs } from "@/db/schema";
import { getSessionUser, requireUser } from "@/lib/auth";
import { getServerConfig, VIDEO_CATEGORIES } from "@/lib/config";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { buildVideosPayload } from "@/lib/serialize";
import { extractHashtags } from "@/lib/utils";
import { videoCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Long-video catalogue: search, categories, sorting and cursor pagination. */
export async function GET(req: Request) {
  try {
    const viewer = await getSessionUser(req);
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind") === "clip" ? "clip" : "long";
    const category = url.searchParams.get("category");
    const q = url.searchParams.get("q");
    const ownerId = url.searchParams.get("ownerId");
    const sort = url.searchParams.get("sort") ?? "recent";
    const cursor = url.searchParams.get("cursor");
    const limit = Math.min(24, Math.max(1, Number(url.searchParams.get("limit") ?? 12)));

    const conditions = [
      eq(videos.kind, kind),
      sql`${videos.deletedAt} is null`,
      sql`(${videos.audience} = 'public' or ${videos.ownerId} = ${viewer?.id ?? sql`null`})`,
    ];
    if (category && VIDEO_CATEGORIES.includes(category as never)) conditions.push(eq(videos.category, category));
    if (ownerId) conditions.push(eq(videos.ownerId, ownerId));
    if (q) {
      const term = `%${q.slice(0, 60).replace(/[%_]/g, "")}%`;
      conditions.push(or(sql`${videos.title} ilike ${term}`, sql`${videos.description} ilike ${term}`)!);
    }
    if (cursor) conditions.push(sql`${videos.createdAt} < ${new Date(cursor)}`);

    if (viewer) {
      const blocked = await db
        .select({ other: sql<string>`case when blocker_id = ${viewer.id} then blocked_id else blocker_id end` })
        .from(blocks)
        .where(or(eq(blocks.blockerId, viewer.id), eq(blocks.blockedId, viewer.id)));
      const ids = blocked.map((b) => b.other).filter(Boolean);
      if (ids.length) conditions.push(sql`${videos.ownerId} not in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
    }

    const order =
      sort === "popular"
        ? [sql`(${videos.viewCount} * 1 + ${videos.likeCount} * 8) desc`, desc(videos.createdAt)]
        : sort === "views"
          ? [desc(videos.viewCount)]
          : [desc(videos.createdAt)];

    const rows = await db.select().from(videos).where(and(...conditions)).orderBy(...order).limit(limit + 1);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    void inArray;

    const subscriptions = viewer
      ? (await db.select({ followingId: follows.followingId }).from(follows).where(eq(follows.followerId, viewer.id))).map((r) => r.followingId)
      : [];

    return ok({
      videos: await buildVideosPayload(page, viewer?.id ?? null),
      nextCursor: hasMore ? page[page.length - 1]!.createdAt.toISOString() : null,
      categories: VIDEO_CATEGORIES,
      subscriptions,
    });
  } catch (error) {
    return toResponse(error);
  }
}

/** Publish a clip or a long video from an already uploaded media asset. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await rateLimit(`video:${user.id}`, 20, 3600);
    const config = await getServerConfig();
    const body = await readBody(req, videoCreateSchema);

    const [asset] = await db.select().from(media).where(and(eq(media.id, body.mediaId), eq(media.ownerId, user.id))).limit(1);
    if (!asset) throw new ApiError(404, "media_not_found", "Upload the video file first");
    if (asset.kind !== "video") throw new ApiError(415, "not_a_video", "The selected file is not a video");

    const kind = body.kind ?? "long";
    const durationMs = body.durationMs ?? asset.durationMs ?? 0;
    const maxMs = kind === "clip" ? config.clipMaxSeconds * 1000 : config.longVideoMaxSeconds * 1000;
    if (durationMs > maxMs) {
      throw new ApiError(422, "duration_exceeded", `${kind === "clip" ? "Clips" : "Videos"} are limited to ${Math.round(maxMs / 1000)} seconds`);
    }
    if (kind === "clip" && durationMs && durationMs < config.clipMinSeconds * 1000) {
      throw new ApiError(422, "too_short", `A clip must be at least ${config.clipMinSeconds} seconds long`);
    }

    const hashtags = Array.from(new Set([...(body.hashtags ?? []), ...extractHashtags(body.description ?? "")]))
      .map((tag) => tag.toLowerCase().replace(/^#/, ""))
      .slice(0, 12);

    const [row] = await db
      .insert(videos)
      .values({
        ownerId: user.id,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        category: VIDEO_CATEGORIES.includes((body.category ?? "blogs") as never) ? (body.category ?? "blogs") : "blogs",
        kind,
        mediaId: asset.id,
        posterKey: body.posterKey ?? null,
        hashtags,
        durationMs: durationMs || null,
        audience: body.audience ?? "public",
        commentsEnabled: body.commentsEnabled ?? true,
        status: "ready",
        processingNote: asset.remoteUrl
          ? "External demo asset"
          : "Original file is served progressively. Multi-quality HLS transcoding requires an external media service (see DEPLOYMENT.md).",
      })
      .returning();

    await db.insert(videoJobs).values({ videoId: row!.id, stage: "done", status: "ready", progress: 100 });
    // Publishing switches the account into creator mode automatically.
    if (!user.isCreator) {
      const { profiles } = await import("@/db/schema");
      await db.update(profiles).set({ isCreator: true }).where(eq(profiles.id, user.id));
    }

    return ok({ video: (await buildVideosPayload([row!], user.id))[0] }, { status: 201 });
  } catch (error) {
    return toResponse(error);
  }
}
