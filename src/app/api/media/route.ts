import { db } from "@/db";
import { media } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getServerConfig } from "@/lib/config";
import { ApiError, ok, rateLimit, toResponse, clientIp } from "@/lib/http";
import { serializeMedia } from "@/lib/media";
import { deleteMedia } from "@/lib/storage";
import { and, eq } from "drizzle-orm";
import { AUDIO_MIME, FILE_MIME, IMAGE_MIME, VIDEO_MIME, writeMedia } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PURPOSES = ["image", "video", "audio", "file", "avatar", "cover", "story", "clip"] as const;
type Purpose = (typeof PURPOSES)[number];

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await rateLimit(`media:${user.id}`, 60, 300);
    const config = await getServerConfig();

    const form = await req.formData().catch(() => null);
    if (!form) throw new ApiError(400, "invalid_form", "Expected multipart/form-data with a 'file' field");
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(422, "missing_file", "No file was provided");
    const purposeRaw = String(form.get("purpose") ?? "file");
    const purpose: Purpose = (PURPOSES as readonly string[]).includes(purposeRaw) ? (purposeRaw as Purpose) : "file";
    const visibility = String(form.get("visibility") ?? "public");
    const width = Number(form.get("width") ?? 0) || null;
    const height = Number(form.get("height") ?? 0) || null;
    const durationMs = Number(form.get("durationMs") ?? 0) || null;

    const limitMap: Record<Purpose, number> = {
      image: config.imageMaxMb,
      avatar: config.imageMaxMb,
      cover: config.imageMaxMb,
      video: config.videoMaxMb,
      clip: config.videoMaxMb,
      audio: config.audioMaxMb,
      file: config.fileMaxMb,
      story: Math.max(config.imageMaxMb, config.videoMaxMb),
    };
    const allowedMap: Record<Purpose, string[]> = {
      image: IMAGE_MIME,
      avatar: IMAGE_MIME,
      cover: IMAGE_MIME,
      video: VIDEO_MIME,
      clip: VIDEO_MIME,
      audio: AUDIO_MIME,
      file: [...FILE_MIME, ...IMAGE_MIME],
      story: [...IMAGE_MIME, ...VIDEO_MIME],
    };

    const written = await writeMedia({
      file,
      ownerId: user.id,
      maxBytes: limitMap[purpose] * 1024 * 1024,
      allowed: allowedMap[purpose],
    });

    // Server-side duration guard for clips (never trust the client only).
    if ((purpose === "clip" || purpose === "video") && durationMs) {
      const maxMs = purpose === "clip" ? config.clipMaxSeconds * 1000 : config.longVideoMaxSeconds * 1000;
      if (durationMs > maxMs) {
        const { deleteMedia } = await import("@/lib/storage");
        await deleteMedia(written.key);
        throw new ApiError(422, "duration_exceeded", `Media is longer than ${Math.round(maxMs / 1000)} seconds`);
      }
    }

    const [row] = await db
      .insert(media)
      .values({
        ownerId: user.id,
        key: written.key,
        mime: written.mime,
        kind: written.kind,
        size: written.size,
        width,
        height,
        durationMs,
        originalName: file.name.slice(0, 180),
        visibility: ["public", "followers", "contacts", "private"].includes(visibility) ? visibility : "public",
      })
      .returning();
    return ok({ media: serializeMedia(row) }, { status: 201 });
  } catch (error) {
    return toResponse(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    const url = new URL(req.url, `http://${req.headers.get("host") ?? "localhost"}`);
    const id = url.searchParams.get("id");
    if (!id) throw new ApiError(422, "missing_id");
    const [row] = await db.select().from(media).where(and(eq(media.id, id), eq(media.ownerId, user.id))).limit(1);
    if (!row) throw new ApiError(404, "not_found", "Media not found");
    void clientIp(req);
    await deleteMedia(row.key);
    await db.delete(media).where(eq(media.id, row.id));
    return ok({ deleted: true });
  } catch (error) {
    return toResponse(error);
  }
}
