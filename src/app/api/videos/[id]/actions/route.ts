import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { playlistItems, playlists, savedItems, videos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { toggleLike } from "@/lib/services";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("like"), source: z.string().max(20).optional() }),
  z.object({ action: z.literal("save") }),
  z.object({ action: z.literal("unsave") }),
  z.object({ action: z.literal("watchLater") }),
  z.object({ action: z.literal("addToPlaylist"), playlistId: z.string().uuid() }),
  z.object({ action: z.literal("removeFromPlaylist"), playlistId: z.string().uuid() }),
]);

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const body = await readBody(req, schema);
    await rateLimit(`video-action:${user.id}`, 200, 60);

    const [video] = await db.select({ id: videos.id, deletedAt: videos.deletedAt }).from(videos).where(eq(videos.id, id)).limit(1);
    if (!video || video.deletedAt) throw new ApiError(404, "not_found", "Video not found");

    if (body.action === "like") return ok(await toggleLike({ entityType: "video", entityId: id, userId: user.id, source: body.source ?? "videos" }));

    if (body.action === "save" || body.action === "unsave") {
      if (body.action === "save") {
        await db.insert(savedItems).values({ userId: user.id, entityType: "video", entityId: id }).onConflictDoNothing();
        return ok({ saved: true });
      }
      await db.delete(savedItems).where(and(eq(savedItems.userId, user.id), eq(savedItems.entityType, "video"), eq(savedItems.entityId, id)));
      return ok({ saved: false });
    }

    // watch later
    if (body.action === "watchLater") {
      const [list] = await db
        .select()
        .from(playlists)
        .where(and(eq(playlists.ownerId, user.id), eq(playlists.kind, "watch_later")))
        .limit(1);
      const playlistId = list?.id ?? (await db.insert(playlists).values({ ownerId: user.id, title: "Watch later", kind: "watch_later", isPublic: false }).returning({ id: playlists.id }))[0]!.id;
      await db.insert(playlistItems).values({ playlistId, videoId: id }).onConflictDoNothing();
      return ok({ playlistId, added: true });
    }

    const [owned] = await db
      .select()
      .from(playlists)
      .where(and(eq(playlists.id, body.playlistId), eq(playlists.ownerId, user.id)))
      .limit(1);
    if (!owned) throw new ApiError(403, "forbidden", "You can only edit your own playlists");
    if (body.action === "addToPlaylist") {
      const max = await db.select({ position: sql<number>`coalesce(max(position), -1)::int` }).from(playlistItems).where(eq(playlistItems.playlistId, owned.id));
      await db
        .insert(playlistItems)
        .values({ playlistId: owned.id, videoId: id, position: (max[0]?.position ?? -1) + 1 })
        .onConflictDoNothing();
      return ok({ added: true, playlistTitle: owned.title });
    }
    await db.delete(playlistItems).where(and(eq(playlistItems.playlistId, owned.id), eq(playlistItems.videoId, id)));
    return ok({ removed: true });
  } catch (error) {
    return toResponse(error);
  }
}
