import { NextResponse } from "next/server";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { requireUser } from "@/lib/auth";
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
    await requireUser(req);
    const { contentType, ext } = await req.json();
    
    const key = `${randomUUID()}.${ext}`;
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
      ACL: "public-read",
    });

    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 });
    const mediaId = randomUUID(); // Временный ID, можно сохранить в БД позже
    
    return NextResponse.json({ presignedUrl, key, mediaId });
  } catch (error) {
    console.error("Presigned URL error:", error);
    return NextResponse.json({ error: "Failed to create URL" }, { status: 500 });
  }
}