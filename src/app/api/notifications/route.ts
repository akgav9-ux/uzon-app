import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { notifications, profiles } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ok, rateLimit, readBody, toResponse } from "@/lib/http";
import { mediaSrc } from "@/lib/media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), ids: z.array(z.string().uuid()).max(100).optional() }),
  z.object({ action: z.literal("readAll") }),
  z.object({ action: z.literal("delete"), ids: z.array(z.string().uuid()).min(1).max(100) }),
]);

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor");
    const onlyUnread = url.searchParams.get("unread") === "1";
    const conditions = [eq(notifications.userId, user.id)];
    if (cursor) conditions.push(sql`${notifications.createdAt} < ${new Date(cursor)}`);
    if (onlyUnread) conditions.push(isNull(notifications.readAt));

    const rows = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(41);
    const hasMore = rows.length > 40;
    const page = hasMore ? rows.slice(0, 40) : rows;

    const actorIds = page.map((n) => n.actorId).filter((a): a is string => Boolean(a));
    const actors = actorIds.length
      ? await db
          .select({ id: profiles.id, username: profiles.username, displayName: profiles.displayName, avatarKey: profiles.avatarKey })
          .from(profiles)
          .where(inArray(profiles.id, actorIds))
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a]));
    const [unreadRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));

    return ok({
      notifications: page.map((n) => ({
        id: n.id,
        type: n.type,
        entityType: n.entityType,
        entityId: n.entityId,
        preview: n.preview,
        groupCount: n.groupCount,
        read: Boolean(n.readAt),
        createdAt: n.createdAt.toISOString(),
        actor: n.actorId
          ? {
              id: n.actorId,
              username: actorMap.get(n.actorId)?.username ?? "user",
              displayName: actorMap.get(n.actorId)?.displayName ?? "UZON user",
              avatarUrl: actorMap.get(n.actorId)?.avatarKey ? mediaSrc({ key: actorMap.get(n.actorId)?.avatarKey ?? "" }) : null,
            }
          : null,
      })),
      unread: unreadRow?.count ?? 0,
      nextCursor: hasMore ? page[page.length - 1]!.createdAt.toISOString() : null,
    });
  } catch (error) {
    return toResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = await readBody(req, postSchema);
    await rateLimit(`notif:${user.id}`, 60, 60);

    if (body.action === "readAll") {
      await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
      return ok({ updated: true });
    }
    if (body.action === "read") {
      const ids = body.ids;
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(ids?.length ? and(eq(notifications.userId, user.id), inArray(notifications.id, ids)) : and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
      return ok({ updated: true });
    }
    await db.delete(notifications).where(and(eq(notifications.userId, user.id), inArray(notifications.id, body.ids)));
    return ok({ deleted: body.ids.length });
  } catch (error) {
    return toResponse(error);
  }
}
