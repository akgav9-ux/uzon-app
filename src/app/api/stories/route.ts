import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blocks, follows, media, privacySettings, stories, storyViews } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getServerConfig } from "@/lib/config";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { buildStoryPayload } from "@/lib/serialize";
import { evaluatePrivacyRule, type PrivacyRule } from "@/lib/access";
import { storyCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Story tray: active (non-expired) stories grouped per author, filtered by the
 * author's `whoCanSeeStories` rule and by blocks. Expiry is enforced here on
 * the server, never in the client.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");

    const conditions = [sql`${stories.expiresAt} > now()`, sql`${stories.deletedAt} is null`];
    if (userId) conditions.push(eq(stories.userId, userId));

    const rows = await db.select().from(stories).where(and(...conditions)).orderBy(desc(stories.createdAt)).limit(200);

    const authorIds = Array.from(new Set(rows.map((r) => r.userId)));
    const [privacyRows, followingRows, blockedRows, contactRows] = await Promise.all([
      authorIds.length ? db.select().from(privacySettings).where(inArray(privacySettings.userId, authorIds)) : Promise.resolve([]),
      authorIds.length
        ? db.select().from(follows).where(and(eq(follows.followerId, user.id), inArray(follows.followingId, authorIds)))
        : Promise.resolve([]),
      db
        .select()
        .from(blocks)
        .where(or(eq(blocks.blockerId, user.id), eq(blocks.blockedId, user.id))),
      Promise.resolve([] as { ownerId: string; matchedUserId: string | null }[]),
    ]);
    void contactRows;

    const privacyMap = new Map(privacyRows.map((p) => [p.userId, p]));
    const following = new Set(followingRows.map((f) => f.followingId));
    const blockedIds = new Set(
      blockedRows.map((b) => (b.blockerId === user.id ? b.blockedId : b.blockerId)),
    );

    const visible = rows.filter((row) => {
      if (row.userId === user.id) return true;
      if (blockedIds.has(row.userId)) return false;
      const rule = (privacyMap.get(row.userId)?.whoCanSeeStories ?? "everyone") as PrivacyRule;
      return evaluatePrivacyRule(rule, {
        viewerId: user.id,
        ownerId: row.userId,
        isOwner: false,
        viewerFollowsOwner: following.has(row.userId),
        ownerFollowsViewer: false,
        isContact: false,
        isSelected: false,
        blocked: false,
        isStaff: user.role === "admin" || user.role === "moderator",
      });
    });

    const payload = await buildStoryPayload(visible, user.id);
    const groups = new Map<string, typeof payload>();
    for (const story of payload) {
      groups.set(story.userId, [...(groups.get(story.userId) ?? []), story]);
    }
    return ok({
      tray: Array.from(groups.entries()).map(([ownerId, items]) => ({
        userId: ownerId,
        author: items[0]!.author,
        hasUnseen: items.some((i) => !i.seenByViewer && !i.isMine),
        count: items.length,
        stories: items,
      })),
    });
  } catch (error) {
    return toResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await rateLimit(`story:${user.id}`, 20, 3600);
    const config = await getServerConfig();
    const body = await readBody(req, storyCreateSchema);

    const [asset] = await db.select().from(media).where(and(eq(media.id, body.mediaId), eq(media.ownerId, user.id))).limit(1);
    if (!asset) throw new ApiError(404, "media_not_found", "Upload the media first");
    if (asset.kind !== "image" && asset.kind !== "video") {
      throw new ApiError(415, "unsupported_media_type", "Stories support photos and videos only");
    }
    if (asset.kind === "video" && (asset.durationMs ?? 0) > config.storyMaxSeconds * 1000) {
      throw new ApiError(422, "duration_exceeded", `Story videos are limited to ${config.storyMaxSeconds} seconds`);
    }

    const [row] = await db
      .insert(stories)
      .values({
        userId: user.id,
        mediaId: asset.id,
        caption: body.caption?.trim() || null,
        overlayText: body.overlayText?.trim() || null,
        audience: body.audience ?? "public",
        expiresAt: new Date(Date.now() + config.storyLifetimeHours * 3_600_000),
      })
      .returning();

    const payload = await buildStoryPayload([row!], user.id);
    return ok({ story: payload[0], expiresAt: row!.expiresAt.toISOString(), lifetimeHours: config.storyLifetimeHours }, { status: 201 });
  } catch (error) {
    return toResponse(error);
  }
}

/** Housekeeping: expired stories are removed from listings and their files deleted. */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    if (user.role !== "admin" && user.role !== "moderator") throw new ApiError(403, "forbidden");
    const expired = await db.select().from(stories).where(lt(stories.expiresAt, new Date())).limit(500);
    const { deleteMedia } = await import("@/lib/storage");
    for (const story of expired) {
      if (story.mediaId) {
        const [asset] = await db.select().from(media).where(eq(media.id, story.mediaId)).limit(1);
        if (asset && !asset.remoteUrl) await deleteMedia(asset.key);
        await db.delete(media).where(eq(media.id, story.mediaId));
      }
      await db.delete(stories).where(eq(stories.id, story.id));
    }
    return ok({ cleaned: expired.length });
  } catch (error) {
    return toResponse(error);
  }
}
