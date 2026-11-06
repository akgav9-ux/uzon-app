import { db } from "@/db";
import { appConfig } from "@/db/schema";
import { sql } from "drizzle-orm";

export type ServerConfig = {
  clipMaxSeconds: number;
  clipMinSeconds: number;
  longVideoMaxSeconds: number;
  storyMaxSeconds: number;
  imageMaxMb: number;
  videoMaxMb: number;
  audioMaxMb: number;
  fileMaxMb: number;
  postMaxLength: number;
  viewRegisterMs: number;
  viewCooldownMinutes: number;
  storyLifetimeHours: number;
  iceServers: { urls: string[]; username?: string; credential?: string }[];
  demoMode: boolean;
};

export const DEFAULT_CONFIG: ServerConfig = {
  clipMaxSeconds: 300,
  clipMinSeconds: 2,
  longVideoMaxSeconds: 4 * 3600,
  storyMaxSeconds: 60,
  imageMaxMb: 12,
  videoMaxMb: Number(process.env.MEDIA_MAX_VIDEO_MB ?? 256),
  audioMaxMb: 25,
  fileMaxMb: 50,
  postMaxLength: 4000,
  viewRegisterMs: 3000,
  viewCooldownMinutes: 30,
  storyLifetimeHours: 24,
  iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
  // Demo mode is opt-in. Production can never enable it.
  demoMode: false,
};

let cache: { value: ServerConfig; at: number } | null = null;

/**
 * Runtime limits live in the database (`app_config`) so an operator can change
 * the maximum clip length without redeploying clients. Falls back to defaults
 * when the table is not reachable yet.
 */
export async function getServerConfig(): Promise<ServerConfig> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;

  let value: ServerConfig = { ...DEFAULT_CONFIG };
  try {
    const rows = await db.select().from(appConfig).limit(50);
    for (const row of rows) {
      if (row.key === "iceServers" && Array.isArray(row.value)) {
        value = { ...value, iceServers: row.value as ServerConfig["iceServers"] };
        continue;
      }
      if (row.key in value && typeof row.value === "number") {
        value = { ...value, [row.key]: row.value } as ServerConfig;
      }
      if (row.key in value && typeof row.value === "boolean") {
        value = { ...value, [row.key]: row.value } as ServerConfig;
      }
    }
  } catch {
    /* table missing during first boot — defaults apply */
  }

  const turnUrl = process.env.TURN_URL;
  if (turnUrl) {
    value = {
      ...value,
      iceServers: [
        ...value.iceServers,
        {
          urls: [turnUrl],
          username: process.env.TURN_USERNAME,
          credential: process.env.TURN_CREDENTIAL,
        },
      ],
    };
  }

  // Demo endpoints/codes are available only when explicitly enabled in local
  // development. NODE_ENV=production always disables demo mode (including Vercel).
  const demoMode = process.env.NODE_ENV !== "production" && process.env.UZON_DEMO_MODE === "true";
  value = { ...value, demoMode };

  cache = { value, at: Date.now() };
  return value;
}

export async function setServerConfig(key: keyof ServerConfig, value: number | boolean): Promise<void> {
  await db
    .insert(appConfig)
    .values({ key, value: value as never })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: value as never, updatedAt: sql`now()` } });
  cache = null;
}

/** Subset exposed to the browser. TURN auth is still passed through here; move
 * to short-lived provider-issued credentials before changing the WebRTC flow. */
export function publicConfig(config: ServerConfig) {
  return {
    clipMaxSeconds: config.clipMaxSeconds,
    clipMinSeconds: config.clipMinSeconds,
    storyMaxSeconds: config.storyMaxSeconds,
    imageMaxMb: config.imageMaxMb,
    videoMaxMb: config.videoMaxMb,
    audioMaxMb: config.audioMaxMb,
    fileMaxMb: config.fileMaxMb,
    postMaxLength: config.postMaxLength,
    viewRegisterMs: config.viewRegisterMs,
    storyLifetimeHours: config.storyLifetimeHours,
    iceServers: config.iceServers.map((server) => ({
      urls: server.urls,
      username: server.username,
      credential: server.credential,
    })),
    demoMode: config.demoMode,
  };
}

export const VIDEO_CATEGORIES = [
  "blogs",
  "news",
  "travel",
  "education",
  "technology",
  "entertainment",
  "documentary",
  "music",
  "sport",
  "culture",
] as const;
export type VideoCategory = (typeof VIDEO_CATEGORIES)[number];
