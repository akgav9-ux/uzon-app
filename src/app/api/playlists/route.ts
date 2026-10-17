import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { playlistItems, playlists, videos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { playlistSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const rows = await db
      .select()
      .from(playlists)
      .where(eq(playlists.ownerId, user.id))
      .orderBy(desc(playlists.createdAt))
      .limit(100);
    const counts = rows.length
      ? await db
          .select({ playlistId: playlistItems.playlistId, count: sql<number>`count(*)::int` })
          .from(playlistItems)
          .where(sql`${playlistItems.playlistId} = any(${sql.raw(`ARRAY[${rows.map((r) => `'${r.id}'`).join(",") || "NULL"}]::uuid[]`)})`)
          .groupBy(playlistItems.playlistId)
      : [];
    const countMap = new Map(counts.map((c) => [c.playlistId, c.count]));
    return ok({
      playlists: rows.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        kind: p.kind,
        isPublic: p.isPublic,
        itemCount: countMap.get(p.id) ?? 0,
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return toResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await rateLimit(`playlist:${user.id}`, 30, 600);
    const body = await readBody(req, playlistSchema);
    const [row] = await db
      .insert(playlists)
      .values({ ownerId: user.id, title: body.title.trim(), description: body.description?.trim() ?? null, isPublic: body.isPublic ?? true })
      .returning();
    if (body.videoId) {
      await db.insert(playlistItems).values({ playlistId: row!.id, videoId: body.videoId, position: 0 }).onConflictDoNothing();
    }
    return ok({ playlist: row }, { status: 201 });
  } catch (error) {
    return toResponse(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind") === "watch_later" ? "watch_later" : "playlist";
    const videoId = url.searchParams.get("videoId");
    if (!videoId) throw new ApiError(422, "missing_video", "videoId is required");
    const [list] = await db
      .select()
      .from(playlists)
      .where(and(eq(playlists.ownerId, user.id), eq(playlists.kind, kind)))
      .limit(1);
    if (!list) return ok({ removed: false, reason: "list_not_found" });
    await db.delete(playlistItems).where(and(eq(playlistItems.playlistId, list.id), eq(playlistItems.videoId, videoId)));
    const [video] = await db.select({ id: videos.id }).from(videos).where(eq(videos.id, videoId)).limit(1);
    return ok({ removed: Boolean(video), playlistId: list.id });
  } catch (error) {
    return toResponse(error);
  }
}
