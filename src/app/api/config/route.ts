import { db } from "@/db";
import { demoAccounts } from "@/db/schema";
import { getServerConfig, publicConfig } from "@/lib/config";
import { ok, toResponse } from "@/lib/http";
import { isEmailConfigured, isSmsConfigured } from "@/lib/mailer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Honest capability report. Anything that needs an external service is flagged
 * here instead of pretending to work in the UI.
 */
export async function GET() {
  try {
    const config = await getServerConfig();
    let demo: { username: string; password: string; role: string; note: string | null }[] = [];
    if (config.demoMode) {
      const rows = await db.select().from(demoAccounts).limit(12).catch(() => []);
      demo = rows.map((r) => ({ username: r.username, password: r.password, role: r.role, note: r.note }));
    }
    return ok({
      config: publicConfig(config),
      demoMode: config.demoMode,
      demoAccounts: demo,
      integrations: {
        emailDelivery: isEmailConfigured(),
        smsDelivery: isSmsConfigured(),
        turnServer: Boolean(process.env.TURN_URL),
        pushNotifications: Boolean(process.env.FCM_SERVER_KEY),
        objectStorage: (process.env.STORAGE_DRIVER ?? "local") as string,
        videoTranscoding: false,
      },
      features: {
        messenger: true,
        groups: true,
        channels: true,
        stories: true,
        clips: true,
        longVideos: true,
        creatorStudio: true,
        calls: true,
        search: true,
        notifications: true,
        moderation: true,
        monetization: false,
        scheduledPosts: false,
        groupCalls: false,
        e2eSecretChats: false,
        pushNotifications: Boolean(process.env.FCM_SERVER_KEY),
        videoTranscoding: false,
        subtitles: false,
      },
    });
  } catch (error) {
    return toResponse(error);
  }
}
