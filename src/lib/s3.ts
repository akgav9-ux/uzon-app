import { S3Client } from "@aws-sdk/client-s3";

export const s3Client = new S3Client({
  region: process.env.S3_REGION || "ru-7",
  endpoint: process.env.S3_ENDPOINT || "https://s3.ru-7.storage.selcloud.ru",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
  forcePathStyle: true, // Важно для Selectel
});

export const S3_BUCKET = process.env.S3_BUCKET || "uzon-media";
export const S3_PUBLIC_URL = `${process.env.S3_ENDPOINT}/${S3_BUCKET}`;