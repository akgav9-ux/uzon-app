import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, conversations, messages, posts, profiles, reports, stories, videos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse, clientIp } from "@/lib/http";
import { reportSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REASONS = ["spam", "harassment", "nudity", "violence", "copyright", "other"];

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await rateLimit(`report:${user.id}`, 10, 3600);
    await rateLimit(`report-ip:${clientIp(req)}`, 20, 3600);
    const body = await readBody(req, reportSchema);
    const reason = REASONS.includes(body.reason) ? body.reason : "other";

    // Verify the reported entity exists and the reporter may see it.
    const exists = await entityExists(body.entityType, body.entityId);
    if (!exists) throw new ApiError(404, "not_found", "The reported content was not found");

    const duplicate = await db
      .select({ id: reports.id })
      .from(reports)
      .where(
        and(
          eq(reports.reporterId, user.id),
          eq(reports.entityType, body.entityType),
          eq(reports.entityId, body.entityId),
          sql`${reports.createdAt} > now() - interval '24 hours'`,
        ),
      )
      .limit(1);
    if (duplicate[0]) return ok({ reported: true, duplicate: true });

    await db.insert(reports).values({
      reporterId: user.id,
      entityType: body.entityType,
      entityId: body.entityId,
      reason,
      details: body.details?.slice(0, 1000) ?? null,
    });
    return ok({ reported: true }, { status: 201 });
  } catch (error) {
    return toResponse(error);
  }
}

async function entityExists(entityType: string, entityId: string): Promise<boolean> {
  const count = async (rows: unknown[]) => rows.length > 0;
  switch (entityType) {
    case "post":
      return count(await db.select({ id: posts.id }).from(posts).where(eq(posts.id, entityId)).limit(1));
    case "video":
      return count(await db.select({ id: videos.id }).from(videos).where(eq(videos.id, entityId)).limit(1));
    case "message":
      return count(await db.select({ id: messages.id }).from(messages).where(eq(messages.id, entityId)).limit(1));
    case "comment":
      return count(await db.select({ id: comments.id }).from(comments).where(eq(comments.id, entityId)).limit(1));
    case "story":
      return count(await db.select({ id: stories.id }).from(stories).where(eq(stories.id, entityId)).limit(1));
    case "channel":
    case "group":
      return count(await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.id, entityId)).limit(1));
    case "user":
      return count(await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, entityId)).limit(1));
    default:
      return false;
  }
}
