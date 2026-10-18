import { z } from "zod";

export class ClientApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const errorShape = z.object({ error: z.object({ code: z.string(), message: z.string().optional() }) });

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const parsed = errorShape.safeParse(data);
    throw new ClientApiError(
      res.status,
      parsed.success ? parsed.data.error.code : "http_error",
      parsed.success ? (parsed.data.error.message ?? parsed.data.error.code) : `Request failed (${res.status})`,
    );
  }
  return data as T;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  return parseResponse<T>(res);
}

export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
export const patch = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) });
export const del = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "DELETE", body: body === undefined ? undefined : JSON.stringify(body) });
export const get = <T>(path: string) => api<T>(path, { method: "GET" });

/** Загрузка напрямую в S3 (Selectel) через presigned URL. */
export async function uploadMedia(
  file: File,
  opts: {
    purpose: "image" | "video" | "audio" | "file" | "avatar" | "cover" | "story" | "clip";
    visibility?: string;
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  },
): Promise<{ media: { id: string; key: string; url: string; kind: string; mime: string; size: number } }> {
  // 1. Определяем расширение по MIME
  const mime = file.type.toLowerCase().split(";")[0].trim();
  const extMap: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
    "audio/mpeg": "mp3", "audio/webm": "weba", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/wav": "wav",
    "application/pdf": "pdf", "text/plain": "txt", "application/zip": "zip",
  };
  const ext = extMap[mime] ?? "bin";

  // 2. Получаем presigned URL от нашего API
  const { presignedUrl, key, mediaId } = await post<{ presignedUrl: string; key: string; mediaId: string }>(
    "/api/upload/presigned",
    { contentType: mime, ext, purpose: opts.purpose, visibility: opts.visibility }
  );

  // 3. Загружаем файл напрямую в S3 (с прогрессом)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", presignedUrl);
    xhr.setRequestHeader("Content-Type", mime);
    
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) opts.onProgress?.(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // Файл загружен, возвращаем данные
        resolve({
          media: {
            id: mediaId,
            key,
            url: `/api/media/${key}`,
            kind: opts.purpose === "image" ? "image" : opts.purpose === "video" || opts.purpose === "clip" ? "video" : "file",
            mime,
            size: file.size,
          },
        });
      } else {
        reject(new ClientApiError(xhr.status, "upload_failed", "Upload to S3 failed"));
      }
    };

    xhr.onerror = () => reject(new ClientApiError(0, "network_error", "Network error during upload"));
    xhr.onabort = () => reject(new ClientApiError(0, "aborted", "Upload cancelled"));
    opts.signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });
}

export const qk = {
  me: ["me"] as const,
  config: ["config"] as const,
  feed: (tab: string, cursor?: string) => ["feed", tab, cursor] as const,
  stories: ["stories"] as const,
  storyTray: ["story-tray"] as const,
  conversations: ["conversations"] as const,
  messages: (id: string) => ["messages", id] as const,
  conversation: (id: string) => ["conversation", id] as const,
  clips: (cursor?: string) => ["clips", cursor] as const,
  videos: (params: string) => ["videos", params] as const,
  video: (id: string) => ["video", id] as const,
  profile: (username: string) => ["profile", username] as const,
  userPosts: (id: string, kind: string) => ["user-content", id, kind] as const,
  notifications: ["notifications"] as const,
  search: (q: string, type: string) => ["search", q, type] as const,
  comments: (type: string, id: string) => ["comments", type, id] as const,
  playlists: ["playlists"] as const,
  studio: (period: number) => ["studio", period] as const,
  reports: (status: string) => ["admin-reports", status] as const,
  sessions: ["sessions"] as const,
  contacts: ["contacts"] as const,
  blocks: ["blocks"] as const,
  calls: ["calls"] as const,
  callSignals: (id: string) => ["call-signals", id] as const,
  call: (id: string) => ["call", id] as const,
  saved: ["saved"] as const,
  history: ["history"] as const,
  channel: (slug: string) => ["channel", slug] as const,
  suggestions: ["suggestions"] as const,
};