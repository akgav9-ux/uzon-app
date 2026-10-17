import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { playlistItems, playlists, videos } from "@/db/schema";
import { getSessionUser, requireUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { buildVideosPayload } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), videoId: z.string().uuid() }),
  z.object({ action: z.literal("remove"), videoId: z.string().uuid() }),
]);

async function loadList(id: string, viewerId: string | null, role: string) {
  const [list] = await db.select().from(playlists).where(eq(playlists.id, id)).limit(1);
  if (!list) throw new ApiError(404, "not_found", "Playlist not found");
  if (!list.isPublic && list.ownerId !== viewerId && role === "user") throw new ApiError(403, "forbidden");
  return list;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const viewer = await getSessionUser(req);
    const { id } = await params;
    const list = await loadList(id, viewer?.id ?? null, viewer?.role ?? "user");
    const items = await db
      .select({ video: videos, position: playlistItems.position })
      .from(playlistItems)
      .innerJoin(videos, eq(videos.id, playlistItems.videoId))
      .where(and(eq(playlistItems.playlistId, id), sql`${videos.deletedAt} is null`))
      .orderBy(asc(playlistItems.position), sql`${playlistItems.addedAt} desc`)
      .limit(100);
    return ok({ playlist: { id: list.id, title: list.title, kind: list.kind, isPublic: list.isPublic, itemCount: items.length }, videos: await buildVideosPayload(items.map((i) => i.video), viewer?.id ?? null) });
  } catch (error) {
    return toResponse(error);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const body = await readBody(req, bodySchema);
    await rateLimit(`playlist-item:${user.id}`, 60, 300);
    const [list] = await db.select().from(playlists).where(eq(playlists.id, id)).limit(1);
    if (!list) {
      // "Watch later" is implicit: create it on first use.
      if (body.action !== "add") throw new ApiError(404, "not_found", "Playlist not found");
      const [created] = await db
        .insert(playlists)
        .values({ ownerId: user.id, title: "Watch later", kind: "watch_later", isPublic: false })
        .returning();
      await db.insert(playlistItems).values({ playlistId: created!.id, videoId: body.videoId }).onConflictDoNothing();
      return ok({ playlistId: created!.id, added: true }, { status: 201 });
    }
    if (list.ownerId !== user.id) throw new ApiError(403, "forbidden", "You can only edit your own playlists");
    if (body.action === "add") {
      const max = await db
        .select({ position: sql<number>`coalesce(max(position), -1)::int` })
        .from(playlistItems)
        .where(eq(playlistItems.playlistId, id));
      await db
        .insert(playlistItems)
        .values({ playlistId: id, videoId: body.videoId, position: (max[0]?.position ?? -1) + 1 })
        .onConflictDoNothing();
      return ok({ added: true });
    }
    await db.delete(playlistItems).where(and(eq(playlistItems.playlistId, id), eq(playlistItems.videoId, body.videoId)));
    return ok({ removed: true });
  } catch (error) {
    return toResponse(error);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const [list] = await db.select().from(playlists).where(and(eq(playlists.id, id), eq(playlists.ownerId, user.id))).limit(1);
    if (!list) throw new ApiError(404, "not_found", "Playlist not found");
    await db.delete(playlists).where(eq(playlists.id, id));
    return ok({ deleted: true });
  } catch (error) {
    return toResponse(error);
  }
}
