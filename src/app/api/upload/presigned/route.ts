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
    
    const key = `${user.id.slice(0, 8)}-${randomUUID()}.${ext}`;
    
    // 1. Создаём запись в БД (пока файл ещё не загружен)
    const [mediaRow] = await db.insert(media).values({
      ownerId: user.id,
      key,
      mime: contentType,
      kind: purpose === "image" ? "image" : purpose === "video" || purpose === "clip" ? "video" : "file",
      size: 0, // Обновится после загрузки (можно добавить отдельный роут)
      visibility: visibility || "public",
      status: "ready",
    }).returning();

    // 2. Генерируем presigned URL
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
      ACL: "public-read",
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 });
    
    return NextResponse.json({ 
      presignedUrl, 
      key, 
      mediaId: mediaRow.id // Возвращаем ID записи
    });
  } catch (error) {
    console.error("Presigned URL error:", error);
    return NextResponse.json({ error: "Failed to create URL" }, { status: 500 });
  }
}