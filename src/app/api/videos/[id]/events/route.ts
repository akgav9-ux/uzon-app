import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { videos, videoProgress, watchHistory } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { registerView } from "@/lib/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("view"), watchMs: z.number().int().min(0).max(24 * 3600 * 1000), source: z.string().max(20).optional() }),
  z.object({ type: z.literal("progress"), positionMs: z.number().int().min(0).max(24 * 3600 * 1000), watchMs: z.number().int().min(0).max(3_600_000).optional() }),
]);

export async function POST(req: Request, { params }: Params) {
  try {
    const viewer = await getSessionUser(req);
    const { id } = await params;
    const body = await readBody(req, schema);
    if (viewer) await rateLimit(`video-event:${viewer.id}`, 120, 60);
    else await rateLimit(`video-event:${req.headers.get("x-forwarded-for") ?? "anon"}`, 30, 60);

    const [video] = await db.select({ id: videos.id, durationMs: videos.durationMs, status: videos.status }).from(videos).where(eq(videos.id, id)).limit(1);
    if (!video) throw new ApiError(404, "not_found", "Video not found");
    if (video.status !== "ready") throw new ApiError(409, "not_ready", "The video is still processing");

    if (body.type === "view") {
      const result = await registerView({ videoId: id, viewerId: viewer?.id ?? null, source: body.source ?? "videos", watchMs: body.watchMs });
      return ok(result);
    }

    if (!viewer) throw new ApiError(401, "unauthenticated", "Sign in to save your position");
    const delta = body.watchMs ?? 0;
    const [existing] = await db.select().from(videoProgress).where(and(eq(videoProgress.videoId, id), eq(videoProgress.userId, viewer.id))).limit(1);
    const completed = video.durationMs ? body.positionMs >= video.durationMs * 0.95 : false;
    if (existing) {
      await db
        .update(videoProgress)
        .set({
          positionMs: body.positionMs,
          watchMs: sql`${videoProgress.watchMs} + ${Math.min(delta, 60_000)}`,
          completions: sql`${videoProgress.completions} + ${completed && body.positionMs > existing.positionMs ? 0 : 0}`,
          updatedAt: new Date(),
        })
        .where(and(eq(videoProgress.videoId, id), eq(videoProgress.userId, viewer.id)));
    } else {
      await db.insert(videoProgress).values({ videoId: id, userId: viewer.id, positionMs: body.positionMs, watchMs: Math.min(delta, 60_000) });
    }
    await db
      .insert(watchHistory)
      .values({ userId: viewer.id, videoId: id, positionMs: body.positionMs, watchedAt: new Date() })
      .onConflictDoUpdate({ target: [watchHistory.userId, watchHistory.videoId], set: { positionMs: body.positionMs, watchedAt: new Date() } });
    return ok({ saved: true, positionMs: body.positionMs });
  } catch (error) {
    return toResponse(error);
  }
}
