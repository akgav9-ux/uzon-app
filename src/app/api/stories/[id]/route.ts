import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { privacySettings, profiles, stories, storyViews } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { buildStoryPayload } from "@/lib/serialize";
import { getRelation } from "@/lib/services";
import { evaluatePrivacyRule, type PrivacyRule } from "@/lib/access";
import { deleteMedia } from "@/lib/storage";
import { media as mediaTable } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };
const actionSchema = z.discriminatedUnion("action", [z.object({ action: z.literal("view") })]);

async function loadActive(id: string) {
  const [row] = await db.select().from(stories).where(eq(stories.id, id)).limit(1);
  if (!row || row.deletedAt) throw new ApiError(404, "not_found", "Story not found");
  if (row.expiresAt < new Date()) throw new ApiError(410, "expired", "This story has expired");
  return row;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const row = await loadActive(id);
    const isOwner = row.userId === user.id;
    if (!isOwner) {
      const ctx = await getRelation(user.id, row.userId, "whoCanSeeStories");
      const [settings] = await db.select().from(privacySettings).where(eq(privacySettings.userId, row.userId)).limit(1);
      const rule = (settings?.whoCanSeeStories ?? "everyone") as PrivacyRule;
      if (!evaluatePrivacyRule(rule, ctx)) throw new ApiError(403, "forbidden", "This story is not available to you");
      await db
        .insert(storyViews)
        .values({ storyId: row.id, viewerId: user.id })
        .onConflictDoNothing();
    }
    const payload = await buildStoryPayload([row], user.id);
    const viewers = isOwner
      ? await db
          .select({ username: profiles.username, displayName: profiles.displayName, viewedAt: storyViews.viewedAt, userId: storyViews.viewerId })
          .from(storyViews)
          .innerJoin(profiles, eq(profiles.id, storyViews.viewerId))
          .where(eq(storyViews.storyId, row.id))
          .orderBy(sql`${storyViews.viewedAt} desc`)
          .limit(200)
      : [];
    return ok({
      story: payload[0],
      viewers: isOwner ? viewers.map((v) => ({ userId: v.userId, username: v.username, displayName: v.displayName, viewedAt: v.viewedAt.toISOString() })) : undefined,
    });
  } catch (error) {
    return toResponse(error);
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    await readBody(req, actionSchema);
    const row = await loadActive(id);
    if (row.userId === user.id) return ok({ viewed: true, own: true });
    await rateLimit(`story-view:${user.id}`, 200, 60);
    await db.insert(storyViews).values({ storyId: row.id, viewerId: user.id }).onConflictDoNothing();
    return ok({ viewed: true });
  } catch (error) {
    return toResponse(error);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const [row] = await db.select().from(stories).where(eq(stories.id, id)).limit(1);
    if (!row) throw new ApiError(404, "not_found", "Story not found");
    if (row.userId !== user.id && user.role === "user") throw new ApiError(403, "forbidden");
    if (row.mediaId) {
      const [asset] = await db.select().from(mediaTable).where(eq(mediaTable.id, row.mediaId)).limit(1);
      if (asset && !asset.remoteUrl) await deleteMedia(asset.key);
    }
    await db.delete(stories).where(eq(stories.id, id));
    await db.delete(storyViews).where(and(eq(storyViews.storyId, id), gt(storyViews.viewedAt, new Date(0))));
    return ok({ deleted: true });
  } catch (error) {
    return toResponse(error);
  }
}
