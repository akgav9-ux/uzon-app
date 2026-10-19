import { NextResponse } from "next/server";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { requireUser } from "@/lib/auth";
import { db } from "@/db";
import { media } from "@/db/schema";
import { randomUUID } from "node:crypto";

const s3Client = new S3Client({
  region: process.env.S3_REGION || "ru-7",
  endpoint: process.env.S3_ENDPOINT || "https://s3.ru-7.storage.selcloud.ru",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
  forcePathStyle: false,
});

const S3_BUCKET = process.env.S3_BUCKET || "uzon-media";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const { contentType, ext, purpose, visibility } = await req.json();

    // ВАЖНО: нормализуем MIME (без codecs) — и подпись, и клиент должны
    // использовать один и тот же Content-Type.
    const normalizedType = String(contentType || "").split(";")[0].trim() || "application/octet-stream";

    const key = `${user.id.slice(0, 8)}-${randomUUID()}.${ext}`;

    const [mediaRow] = await db.insert(media).values({
      ownerId: user.id,
      key,
      mime: normalizedType,
      kind: purpose === "image" ? "image" : purpose === "video" || purpose === "clip" ? "video" : purpose === "audio" ? "audio" : "file",
      size: 0,
      visibility: visibility || "public",
      status: "ready",
    }).returning();

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: normalizedType, // ← тот же, что на клиенте
      // ACL: "public-read",         // ← УБРАТЬ для Selectel
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 });

    return NextResponse.json({
      presignedUrl,
      key,
      mediaId: mediaRow.id,
      contentType: normalizedType, // ← вернуть клиенту, чтобы он поставил тот же заголовок
    });
  } catch (error) {
    console.error("Presigned URL error:", error);
    return NextResponse.json({ error: "Failed to create URL" }, { status: 500 });
  }
}