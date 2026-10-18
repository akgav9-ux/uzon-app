import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { media, postMedia, posts, stories, videos } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { ApiError, fail, toResponse } from "@/lib/http";
import { evaluatePrivacyRule, type PrivacyRule } from "@/lib/access";
import { getRelation } from "@/lib/services";
import { deleteMedia } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ key: string }> };

// Базовый URL вашего S3-хранилища Selectel
const S3_PUBLIC_URL = `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}`;

export async function GET(req: Request, { params }: Params) {
  try {
    const { key } = await params;
    const mediaKey = decodeURIComponent(key);
    const [row] = await db.select().from(media).where(eq(media.key, mediaKey)).limit(1);
    if (!row) return fail(404, "not_found", "Media not found");

    const viewer = await getSessionUser(req);
    await assertCanAccessMedia(row, viewer?.id ?? null, viewer?.role ?? "user");

    // Если у файла есть внешний URL (например, старые файлы), перенаправляем на него
    if (row.remoteUrl) {
      return new Response(null, {
        status: 302,
        headers: { Location: row.remoteUrl, "Cache-Control": "private, max-age=300" },
      });
    }

    // ИСПРАВЛЕНИЕ: Вместо streamMedia (чтения с диска) перенаправляем на S3
    const publicUrl = `${S3_PUBLIC_URL}/${row.key}`;
    return new Response(null, {
      status: 302,
      headers: { Location: publicUrl, "Cache-Control": "public, max-age=3600" },
    });
  } catch (error) {
    return toResponse(error);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { key } = await params;
    const viewer = await getSessionUser(req);
    if (!viewer) throw new ApiError(401, "unauthenticated");
    const [row] = await db.select().from(media).where(eq(media.key, decodeURIComponent(key))).limit(1);
    if (!row) return fail(404, "not_found", "Media not found");
    if (row.ownerId !== viewer.id && viewer.role === "user") throw new ApiError(403, "forbidden");

    const [videoUse, storyUse] = await Promise.all([
      db.select({ id: videos.id }).from(videos).where(eq(videos.mediaId, row.id)).limit(1),
      db.select({ id: stories.id }).from(stories).where(eq(stories.mediaId, row.id)).limit(1),
    ]);
    if (videoUse[0] || storyUse[0]) {
      throw new ApiError(409, "media_in_use", "Delete the video or story that uses this file first");
    }
    await deleteMedia(row.key);
    await db.delete(media).where(eq(media.id, row.id));
    return new Response(null, { status: 204 });
  } catch (error) {
    return toResponse(error);
  }
}

/**
 * Media access is derived from the referencing entity (post / story / video)
 * when one exists, otherwise from the media row visibility. Owners and staff
 * always have access; staff need it for moderation.
 */
async function assertCanAccessMedia(row: typeof media.$inferSelect, viewerId: string | null, role: string) {
  if (row.ownerId === viewerId) return;
  if (role === "admin" || role === "moderator") return;

  const [storyRef] = await db
    .select({ audience: stories.audience, userId: stories.userId, deletedAt: stories.deletedAt, expiresAt: stories.expiresAt })
    .from(stories)
    .where(and(eq(stories.mediaId, row.id), eq(stories.userId, row.ownerId)))
    .limit(1);
  if (storyRef) {
    if (storyRef.deletedAt) throw new ApiError(410, "gone", "Story removed");
    if (storyRef.expiresAt < new Date()) throw new ApiError(410, "expired", "Story expired");
    await assertAudience(storyRef.audience, storyRef.userId, viewerId);
    return;
  }

  const [videoRef] = await db
    .select({ audience: videos.audience, ownerId: videos.ownerId, deletedAt: videos.deletedAt })
    .from(videos)
    .where(eq(videos.mediaId, row.id))
    .limit(1);
  if (videoRef) {
    if (videoRef.deletedAt) throw new ApiError(410, "gone", "Video removed");
    await assertAudience(videoRef.audience, videoRef.ownerId, viewerId);
    return;
  }

  const [postRef] = await db
    .select({ audience: posts.audience, authorId: posts.authorId, deletedAt: posts.deletedAt })
    .from(postMedia)
    .innerJoin(posts, eq(posts.id, postMedia.postId))
    .where(eq(postMedia.mediaId, row.id))
    .limit(1);
  if (postRef) {
    if (postRef.deletedAt) throw new ApiError(410, "gone", "Post removed");
    await assertAudience(postRef.audience, postRef.authorId, viewerId);
    return;
  }

  if (row.visibility === "public") return; // avatars, covers, unattached assets
  await assertAudience(row.visibility, row.ownerId, viewerId);
}

async function assertAudience(audience: string, ownerId: string, viewerId: string | null) {
  if (audience === "public") return;
  if (!viewerId) throw new ApiError(403, "forbidden", "Sign in to view this content");
  const ctx = await getRelation(viewerId, ownerId);
  if (ctx.blocked) throw new ApiError(403, "blocked");
  const allowed = evaluatePrivacyRule(audience as PrivacyRule, ctx);
  if (!allowed) throw new ApiError(403, "forbidden", "Restricted by the author's privacy settings");
}