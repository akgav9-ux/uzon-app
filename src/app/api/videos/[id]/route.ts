import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { videos, videoJobs, playlists, playlistItems } from "@/db/schema";
import { getSessionUser, requireUser } from "@/lib/auth";
import { ApiError, ok, readBody, toResponse } from "@/lib/http";
import { buildVideosPayload } from "@/lib/serialize";
import { getRelation } from "@/lib/services";
import { evaluateAudience, type Audience } from "@/lib/access";
import { audienceSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  description: z.string().max(4000).nullable().optional(),
  category: z.string().max(30).optional(),
  hashtags: z.array(z.string().max(40)).max(12).optional(),
  audience: audienceSchema.optional(),
  commentsEnabled: z.boolean().optional(),
  posterKey: z.string().max(200).nullable().optional(),
});

async function load(id: string) {
  const [row] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (!row || row.deletedAt) throw new ApiError(404, "not_found", "Video not found");
  return row;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const viewer = await getSessionUser(req);
    const { id } = await params;
    const row = await load(id);

    if (viewer) {
      const ctx = await getRelation(viewer.id, row.ownerId);
      if (!evaluateAudience(row.audience as Audience, ctx)) throw new ApiError(403, "forbidden", "This video is restricted");
    } else if (row.audience !== "public") {
      throw new ApiError(403, "forbidden", "Sign in to view this video");
    }

    const [payload] = await buildVideosPayload([row], viewer?.id ?? null);
    const related = await db
      .select()
      .from(videos)
      .where(
        and(
          eq(videos.kind, row.kind),
          eq(videos.category, row.category),
          sql`${videos.id} <> ${row.id}`,
          sql`${videos.deletedAt} is null`,
          eq(videos.audience, "public"),
        ),
      )
      .orderBy(desc(videos.viewCount))
      .limit(8);
    const [job] = await db.select().from(videoJobs).where(eq(videoJobs.videoId, row.id)).orderBy(desc(videoJobs.updatedAt)).limit(1);
    const myPlaylists = viewer
      ? await db
          .select({ id: playlists.id, title: playlists.title, kind: playlists.kind })
          .from(playlists)
          .where(eq(playlists.ownerId, viewer.id))
          .orderBy(desc(playlists.createdAt))
      : [];
    const playlistIds = viewer && myPlaylists.length
      ? (
          await db
            .select({ playlistId: playlistItems.playlistId })
            .from(playlistItems)
            .where(and(eq(playlistItems.videoId, row.id), sql`${playlistItems.playlistId} = any(${sql.raw(`ARRAY[${myPlaylists.map((p) => `'${p.id}'`).join(",")} ]::uuid[]`)})`))
        ).map((r) => r.playlistId)
      : [];

    return ok({ video: payload, related: await buildVideosPayload(related, viewer?.id ?? null), job: job ?? null, playlists: myPlaylists, playlistIds });
  } catch (error) {
    return toResponse(error);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const row = await load(id);
    if (row.ownerId !== user.id && user.role === "user") throw new ApiError(403, "forbidden");
    const body = await readBody(req, patchSchema);
    const [updated] = await db
      .update(videos)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(videos.id, id))
      .returning();
    return ok({ video: (await buildVideosPayload([updated!], user.id))[0] });
  } catch (error) {
    return toResponse(error);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const row = await load(id);
    if (row.ownerId !== user.id && user.role === "user") throw new ApiError(403, "forbidden");
    await db.update(videos).set({ deletedAt: new Date() }).where(eq(videos.id, id));
    return ok({ deleted: true });
  } catch (error) {
    return toResponse(error);
  }
}
