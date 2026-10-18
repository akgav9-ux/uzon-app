import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/http";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Клиент S3 для Selectel
const s3Client = new S3Client({
  region: process.env.S3_REGION || "ru-7",
  endpoint: process.env.S3_ENDPOINT || "https://s3.ru-7.storage.selcloud.ru",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
  forcePathStyle: true, // Важно для Selectel S3
});

const S3_BUCKET = process.env.S3_BUCKET || "uzon-media";
const S3_PUBLIC_URL = `${process.env.S3_ENDPOINT}/${S3_BUCKET}`;

export const MEDIA_ROOT = process.env.MEDIA_DIR
  ? path.resolve(process.env.MEDIA_DIR)
  : path.join(process.cwd(), "uploads");

export const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
export const VIDEO_MIME = ["video/mp4", "video/webm", "video/quicktime"];
export const AUDIO_MIME = ["audio/mpeg", "audio/webm", "audio/ogg", "audio/mp4", "audio/wav"];
export const FILE_MIME = [
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const ALLOWED_MIME = [...IMAGE_MIME, ...VIDEO_MIME, ...AUDIO_MIME, ...FILE_MIME];

export function mediaKind(mime: string): "image" | "video" | "audio" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/webm": "weba",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/zip": "zip",
};

/** Magic-byte sniffing so a renamed executable cannot be uploaded as media. */
function sniff(buffer: Buffer, declaredMime: string): boolean {
  if (buffer.length < 12) return false;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebm = buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  const isGif = buffer.subarray(0, 3).toString("latin1") === "GIF";
  const isRiff = buffer.subarray(0, 4).toString("latin1") === "RIFF";
  const isMp4 = buffer.subarray(4, 8).toString("latin1") === "ftyp";
  const isMov = isMp4;
  const isPdf = buffer.subarray(0, 5).toString("latin1") === "%PDF-";
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isId3 = buffer.subarray(0, 3).toString("latin1") === "ID3";
  const isOgg = buffer.subarray(0, 4).toString("latin1") === "OggS";
  const detected = isJpeg || isPng || isWebm || isGif || isRiff || isMp4 || isMov || isPdf || isZip || isId3 || isOgg;
  if (!detected) return false;
  const kind = mediaKind(declaredMime);
  if (kind === "image") return isJpeg || isPng || isWebm || isGif || (isRiff && declaredMime === "image/webp");
  if (kind === "video") return isMp4 || isWebm || isMov;
  if (kind === "audio") return isId3 || isOgg || isWebm || isMp4 || isRiff;
  return isPdf || isZip;
}

export function mediaUrl(key: string): string {
  return `${S3_PUBLIC_URL}/${key}`;
}

export async function ensureMediaDir(): Promise<void> {
  await mkdir(MEDIA_ROOT, { recursive: true });
}

/**
 * Загружает файл в Selectel S3 и возвращает ключ.
 */
export async function writeMedia(opts: {
  file: File;
  ownerId: string;
  maxBytes: number;
  allowed?: string[];
}): Promise<{ key: string; size: number; mime: string; kind: ReturnType<typeof mediaKind> }> {
  const { file, ownerId, maxBytes } = opts;
  const allowed = opts.allowed ?? ALLOWED_MIME;

  const mime = file.type.toLowerCase().split(";")[0].trim();

  if (!allowed.includes(mime)) {
    throw new ApiError(415, "unsupported_media_type", `Unsupported file type: ${mime || "unknown"}`);
  }
  if (file.size > maxBytes) {
    throw new ApiError(413, "file_too_large", `File exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit`);
  }
  if (file.size === 0) throw new ApiError(422, "empty_file", "The selected file is empty");

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!sniff(buffer, mime)) {
    throw new ApiError(415, "content_mismatch", "File content does not match its declared type");
  }

  const ext = EXT[mime] ?? "bin";
  const key = `${ownerId.slice(0, 8)}-${randomUUID()}.${ext}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mime,
      ACL: "public-read",
    }),
  );

  return { key, size: file.size, mime, kind: mediaKind(mime) };
}

/**
 * Удаляет файл из S3.
 */
export async function deleteMedia(key: string): Promise<void> {
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  } catch {
    /* ignore */
  }
}

/**
 * Оставлены для совместимости со старым кодом (локальная разработка).
 * В production файлы отдаются из S3 напрямую.
 */
export function absoluteMediaPath(key: string): string {
  const resolved = path.join(MEDIA_ROOT, key);
  if (!resolved.startsWith(MEDIA_ROOT)) throw new ApiError(400, "invalid_key", "Invalid media key");
  return resolved;
}

export async function readMediaFile(key: string): Promise<{ size: number; path: string } | null> {
  try {
    const absolute = absoluteMediaPath(key);
    const info = await stat(absolute);
    return { size: info.size, path: absolute };
  } catch {
    return null;
  }
}

export async function streamMedia(opts: {
  key: string;
  mime: string;
  rangeHeader: string | null;
  download?: boolean;
}): Promise<Response | null> {
  const file = await readMediaFile(opts.key);
  if (!file) return null;
  const total = file.size;
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": opts.mime,
    "Cache-Control": "private, max-age=3600",
  });
  if (opts.download) headers.set("Content-Disposition", `attachment; filename="${opts.key.split("/").pop()}"`);

  const range = opts.rangeHeader?.match(/bytes=(\d*)-(\d*)/);
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(total - 1, Number(range[2])) : total - 1;
    if (start >= total || end < start) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(nodeStreamToWeb(createReadStream(file.path, { start, end })), { status: 206, headers });
  }

  headers.set("Content-Length", String(total));
  return new Response(nodeStreamToWeb(createReadStream(file.path)), { status: 200, headers });
}

function nodeStreamToWeb(stream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      (stream as unknown as { destroy?: () => void }).destroy?.();
    },
  });
}

export async function writeBuffer(key: string, data: Buffer): Promise<void> {
  await ensureMediaDir();
  await mkdir(path.dirname(path.join(MEDIA_ROOT, key)), { recursive: true });
  await writeFile(path.join(MEDIA_ROOT, key), data);
}