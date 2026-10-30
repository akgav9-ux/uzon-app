import type { media } from "@/db/schema";

export type MediaRow = typeof media.$inferSelect;

// Публичный адрес S3 Selectel
const S3_PUBLIC_URL =
  "https://adb43e56-5d48-413f-b1e0-b22ead06ebcc.selstorage.ru";

/** Возвращает URL медиафайла для браузера. */
export function mediaSrc(
  mediaLike: { key: string; remoteUrl?: string | null } | null | undefined,
): string | null {
  if (!mediaLike) return null;

  if (mediaLike.remoteUrl) return mediaLike.remoteUrl;

  if (/^https?:\/\//i.test(mediaLike.key)) {
    return mediaLike.key;
  }

  const key = mediaLike.key.replace(/^\/+/, "");
  if (!key) return null;

  return `${S3_PUBLIC_URL}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export function serializeMedia(m: MediaRow | null | undefined) {
  if (!m) return null;

  return {
    id: m.id,
    key: m.key,
    url: mediaSrc(m),
    mime: m.mime,
    kind: m.kind,
    size: m.size,
    width: m.width,
    height: m.height,
    durationMs: m.durationMs,
    visibility: m.visibility,
    createdAt: m.createdAt.toISOString(),
  };
}

/** Public user shape — never contains phone/email unless explicitly allowed. */
export function publicUser(row: {
  id: string;
  username: string;
  displayName: string;
  avatarKey: string | null;
  bio: string | null;
  isCreator: boolean;
  followersCount: number;
  followingCount: number;
  lastSeenAt?: Date | null;
  createdAt?: Date;
}) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarKey
      ? mediaSrc({ key: row.avatarKey })
      : null,
    bio: row.bio,
    isCreator: row.isCreator,
    followersCount: row.followersCount,
    followingCount: row.followingCount,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    createdAt: row.createdAt?.toISOString() ?? null,
  };
}