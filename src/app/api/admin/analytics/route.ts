
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsEvents,
  conversations,
  profiles,
} from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { ok, toResponse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireStaff(req);

    const url = new URL(req.url);
    const requestedDays = Number(url.searchParams.get("days") ?? "7");
    const days = [7, 30, 90].includes(requestedDays)
      ? requestedDays
      : 7;

    const now = new Date();
    const since = new Date(
      now.getTime() - days * 24 * 60 * 60 * 1000,
    );
    const dayAgo = new Date(
      now.getTime() - 24 * 60 * 60 * 1000,
    );
    const weekAgo = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000,
    );
    const monthAgo = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000,
    );

    const [totals] = await db
      .select({
        users: sql<number>`
          count(*) filter (
            where ${profiles.status} <> 'deleted'
          )::int
        `,
        registrationsToday: sql<number>`
          count(*) filter (
            where ${profiles.createdAt} >= ${dayAgo}
              and ${profiles.status} <> 'deleted'
          )::int
        `,
        registrations7d: sql<number>`
          count(*) filter (
            where ${profiles.createdAt} >= ${weekAgo}
              and ${profiles.status} <> 'deleted'
          )::int
        `,
        registrations30d: sql<number>`
          count(*) filter (
            where ${profiles.createdAt} >= ${monthAgo}
              and ${profiles.status} <> 'deleted'
          )::int
        `,
        active24h: sql<number>`
          count(*) filter (
            where ${profiles.lastSeenAt} >= ${dayAgo}
              and ${profiles.status} = 'active'
          )::int
        `,
        active7d: sql<number>`
          count(*) filter (
            where ${profiles.lastSeenAt} >= ${weekAgo}
              and ${profiles.status} = 'active'
          )::int
        `,
        active30d: sql<number>`
          count(*) filter (
            where ${profiles.lastSeenAt} >= ${monthAgo}
              and ${profiles.status} = 'active'
          )::int
        `,
      })
      .from(profiles);

    const registrationRows = await db
      .select({
        day: sql<string>`
          to_char(
            date_trunc('day', ${profiles.createdAt}),
            'YYYY-MM-DD'
          )
        `,
        count: sql<number>`count(*)::int`,
      })
      .from(profiles)
      .where(
        and(
          gte(profiles.createdAt, since),
          eq(profiles.status, "active"),
        ),
      )
      .groupBy(sql`date_trunc('day', ${profiles.createdAt})`)
      .orderBy(sql`date_trunc('day', ${profiles.createdAt})`);

    const eventRows = await db
      .select({
        type: analyticsEvents.type,
        count: sql<number>`count(*)::int`,
        watchMs: sql<number>`
          coalesce(sum(${analyticsEvents.watchMs}), 0)::bigint::int
        `,
      })
      .from(analyticsEvents)
      .where(gte(analyticsEvents.createdAt, since))
      .groupBy(analyticsEvents.type);

    const [content] = await db
      .select({
        channels: sql<number>`
          count(*) filter (where ${conversations.kind} = 'channel')::int
        `,
        groups: sql<number>`
          count(*) filter (where ${conversations.kind} = 'group')::int
        `,
      })
      .from(conversations);

    return ok({
      periodDays: days,
      generatedAt: now.toISOString(),
      totals: totals ?? null,
      registrationsByDay: registrationRows,
      events: eventRows,
      content: content ?? { channels: 0, groups: 0 },
      notes: {
        activeUsers:
          "Based on lastSeenAt; represents authenticated activity, not page visits.",
        events:
          "Counts only events already recorded in analytics_events.",
        registrations:
          "Historical registrations are available from profiles.createdAt.",
      },
    });
  } catch (error) {
    return toResponse(error);
  }
}
