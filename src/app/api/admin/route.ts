import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  comments,
  conversations,
  messages,
  moderationActions,
  posts,
  profiles,
  reports,
  stories,
  videos,
} from "@/db/schema";
import { requireStaff, revokeAllSessions } from "@/lib/auth";
import { ApiError, ok, rateLimit, readBody, toResponse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const actionSchema = z.object({
  reportId: z.string().uuid().optional(),
  action: z.enum(["resolve", "dismiss", "remove_content", "suspend", "restore", "grant_moderator", "revoke_moderator"]),
  entityType: z.enum(["user", "message", "post", "video", "channel", "group", "story", "comment"]).optional(),
  entityId: z.string().uuid().optional(),
  note: z.string().max(500).optional(),
});

const isRoleAction = (action: string) => action === "grant_moderator" || action === "revoke_moderator";

export async function GET(req: Request) {
  try {
    await requireStaff(req);
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "open";
    const rows = await db
      .select({
        report: reports,
        reporterName: profiles.username,
      })
      .from(reports)
      .leftJoin(profiles, eq(profiles.id, reports.reporterId))
      .where(status === "all" ? sql`true` : eq(reports.status, status))
      .orderBy(desc(reports.createdAt))
      .limit(60);

    const log = await db
      .select()
      .from(moderationActions)
      .orderBy(desc(moderationActions.createdAt))
      .limit(40);

    const stats = await db
      .select({
        openReports: sql<number>`(select count(*)::int from reports where status = 'open')`,
        users: sql<number>`(select count(*)::int from profiles where status <> 'deleted')`,
        posts: sql<number>`(select count(*)::int from posts where deleted_at is null)`,
        videos: sql<number>`(select count(*)::int from videos where deleted_at is null)`,
        clips: sql<number>`(select count(*)::int from videos where kind='clip' and deleted_at is null)`,
        messages: sql<number>`(select count(*)::int from messages where deleted_at is null)`,
        channels: sql<number>`(select count(*)::int from conversations where kind='channel')`,
        groups: sql<number>`(select count(*)::int from conversations where kind='group')`,
        stories: sql<number>`(select count(*)::int from stories where expires_at > now() and deleted_at is null)`,
      })
      .from(reports)
      .limit(1);

    return ok({ reports: rows, log, stats: stats[0] ?? null });
  } catch (error) {
    return toResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const staff = await requireStaff(req);
    await rateLimit(`moderation:${staff.id}`, 120, 300);
    const body = await readBody(req, actionSchema);

    // Only an administrator can change moderator roles.
    if (isRoleAction(body.action) && staff.role !== "admin") {
      throw new ApiError(403, "admin_required", "Only an administrator can change moderator roles");
    }

    if (body.reportId) {
      const [report] = await db.select().from(reports).where(eq(reports.id, body.reportId)).limit(1);
      if (!report) throw new ApiError(404, "not_found", "Report not found");

      if (isRoleAction(body.action)) {
        if (report.entityType !== "user") {
          throw new ApiError(422, "invalid_target", "Moderator role actions require a user report");
        }
        await changeModeratorRole(report.entityId, body.action);
      } else {
        await assertTargetIsNotAdmin(report.entityType, report.entityId, body.action);
        await removeContent(report.entityType, report.entityId, body.action);
      }

      const resolvedStatus = body.action === "dismiss" ? "dismissed" : "resolved";
      await db
        .update(reports)
        .set({ status: resolvedStatus, handledBy: staff.id, handledAt: new Date(), resolution: body.note ?? null })
        .where(eq(reports.id, report.id));
      await db.insert(moderationActions).values({
        moderatorId: staff.id,
        action: body.action,
        entityType: report.entityType,
        entityId: report.entityId,
        note: body.note ?? null,
      });
      return ok({ handled: true, status: resolvedStatus });
    }

    if (!body.entityType || !body.entityId) {
      throw new ApiError(422, "missing_target", "entityType and entityId are required");
    }

    if (isRoleAction(body.action)) {
      if (body.entityType !== "user") {
        throw new ApiError(422, "invalid_target", "Moderator role actions require a user target");
      }
      await changeModeratorRole(body.entityId, body.action);
    } else {
      await assertTargetIsNotAdmin(body.entityType, body.entityId, body.action);
      await removeContent(body.entityType, body.entityId, body.action);
    }

    await db.insert(moderationActions).values({
      moderatorId: staff.id,
      action: body.action,
      entityType: body.entityType,
      entityId: body.entityId,
      note: body.note ?? null,
    });
    return ok({ handled: true });
  } catch (error) {
    return toResponse(error);
  }
}

async function assertTargetIsNotAdmin(entityType: string, entityId: string, action: string) {
  if (entityType !== "user" || (action !== "suspend" && action !== "restore")) return;
  const [target] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, entityId))
    .limit(1);
  if (!target) throw new ApiError(404, "not_found", "User not found");
  if (target.role === "admin") {
    throw new ApiError(403, "protected_admin", "Administrator accounts cannot be changed through moderation actions");
  }
}

async function changeModeratorRole(entityId: string, action: string) {
  const [target] = await db
    .select({ id: profiles.id, role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, entityId))
    .limit(1);

  if (!target) throw new ApiError(404, "not_found", "User not found");
  if (target.role === "admin") {
    throw new ApiError(403, "protected_admin", "Administrator roles cannot be changed here");
  }

  if (action === "grant_moderator") {
    if (target.role === "moderator") return;
    if (target.role !== "user") throw new ApiError(409, "role_conflict", "This account cannot be promoted to moderator");
    const updated = await db
      .update(profiles)
      .set({ role: "moderator", updatedAt: new Date() })
      .where(and(eq(profiles.id, entityId), eq(profiles.role, "user")))
      .returning({ id: profiles.id });
    if (!updated.length) throw new ApiError(409, "role_conflict", "The account role changed; refresh and try again");
    return;
  }

  if (action === "revoke_moderator") {
    if (target.role !== "moderator") {
      throw new ApiError(409, "role_conflict", "This account is not a moderator");
    }
    const updated = await db
      .update(profiles)
      .set({ role: "user", updatedAt: new Date() })
      .where(and(eq(profiles.id, entityId), eq(profiles.role, "moderator")))
      .returning({ id: profiles.id });
    if (!updated.length) throw new ApiError(409, "role_conflict", "The account role changed; refresh and try again");
  }
}

async function removeContent(entityType: string, entityId: string, action: string) {
  if (action === "dismiss" || action === "resolve") return;

  switch (entityType) {
    case "post":
      if (action === "remove_content") {
        await db.update(posts).set({ deletedAt: new Date(), text: null }).where(eq(posts.id, entityId));
      }
      return;
    case "video":
      if (action === "remove_content") {
        await db.update(videos).set({ deletedAt: new Date() }).where(eq(videos.id, entityId));
      }
      return;
    case "comment":
      if (action === "remove_content") {
        await db.update(comments).set({ deletedAt: new Date(), text: "[removed by moderator]" }).where(eq(comments.id, entityId));
      }
      return;
    case "story":
      if (action === "remove_content") {
        await db.update(stories).set({ deletedAt: new Date() }).where(eq(stories.id, entityId));
      }
      return;
    case "message":
      if (action === "remove_content") {
        await db.update(messages).set({ deletedAt: new Date(), text: null }).where(eq(messages.id, entityId));
      }
      return;
    case "user":
      if (action === "suspend") {
        await db.update(profiles).set({ status: "suspended", updatedAt: new Date() }).where(eq(profiles.id, entityId));
        await revokeAllSessions(entityId);
      } else if (action === "restore") {
        await db.update(profiles).set({ status: "active", updatedAt: new Date() }).where(eq(profiles.id, entityId));
      }
      return;
    case "channel":
    case "group":
      if (action === "remove_content") await db.delete(conversations).where(eq(conversations.id, entityId));
      return;
    default:
      return;
  }
}
