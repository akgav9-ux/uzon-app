
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  analyticsEvents,
  conversations,
  profiles,
  visitorAnalytics,
} from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { ok, toResponse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireStaff(req);

    const url = new URL(req.url);
    const requestedPeriod = url.searchParams.get("days") ?? "7";
    const days = requestedPeriod === "all" ? 0 : Number(requestedPeriod);
    const validPeriod = days === 0 || [7, 30, 90].includes(days);
    const periodDays = validPeriod ? days : 7;

    const now = new Date();
    const since = new Date(
      periodDays === 0 ? 0 : now.getTime() - periodDays * 24 * 60 * 60 * 1000,
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
        registrationsAllTime: sql<number>`
          count(*) filter (where ${profiles.status} <> 'deleted')::int
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

    const [visitorTotals] = await db
      .select({
        pageViews: sql<number>`count(*)::int`,
        uniqueVisitors: sql<number>`count(distinct ${visitorAnalytics.visitorId})::int`,
        sessions: sql<number>`count(distinct ${visitorAnalytics.sessionId})::int`,
        anonymousPageViews: sql<number>`count(*) filter (where ${visitorAnalytics.userId} is null)::int`,
        registeredPageViews: sql<number>`count(*) filter (where ${visitorAnalytics.userId} is not null)::int`,
      })
      .from(visitorAnalytics)
      .where(gte(visitorAnalytics.createdAt, since));

    const sourceRows = await db
      .select({
        source: visitorAnalytics.source,
        pageViews: sql<number>`count(*)::int`,
        visitors: sql<number>`count(distinct ${visitorAnalytics.visitorId})::int`,
      })
      .from(visitorAnalytics)
      .where(gte(visitorAnalytics.createdAt, since))
      .groupBy(visitorAnalytics.source)
      .orderBy(sql`count(*) desc`);

    const countryRows = await db
      .select({
        country: visitorAnalytics.countryCode,
        visitors: sql<number>`count(distinct ${visitorAnalytics.visitorId})::int`,
      })
      .from(visitorAnalytics)
      .where(gte(visitorAnalytics.createdAt, since))
      .groupBy(visitorAnalytics.countryCode)
      .orderBy(sql`count(distinct ${visitorAnalytics.visitorId}) desc`)
      .limit(20);

    const deviceRows = await db
      .select({
        device: visitorAnalytics.deviceType,
        visitors: sql<number>`count(distinct ${visitorAnalytics.visitorId})::int`,
      })
      .from(visitorAnalytics)
      .where(gte(visitorAnalytics.createdAt, since))
      .groupBy(visitorAnalytics.deviceType)
      .orderBy(sql`count(distinct ${visitorAnalytics.visitorId}) desc`);

    const browserRows = await db
      .select({
        browser: visitorAnalytics.browser,
        visitors: sql<number>`count(distinct ${visitorAnalytics.visitorId})::int`,
      })
      .from(visitorAnalytics)
      .where(gte(visitorAnalytics.createdAt, since))
      .groupBy(visitorAnalytics.browser)
      .orderBy(sql`count(distinct ${visitorAnalytics.visitorId}) desc`);

    const osRows = await db
      .select({
        os: visitorAnalytics.os,
        visitors: sql<number>`count(distinct ${visitorAnalytics.visitorId})::int`,
      })
      .from(visitorAnalytics)
      .where(gte(visitorAnalytics.createdAt, since))
      .groupBy(visitorAnalytics.os)
      .orderBy(sql`count(distinct ${visitorAnalytics.visitorId}) desc`);

    const visitorDailyRows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${visitorAnalytics.createdAt}), 'YYYY-MM-DD')`,
        pageViews: sql<number>`count(*)::int`,
        visitors: sql<number>`count(distinct ${visitorAnalytics.visitorId})::int`,
      })
      .from(visitorAnalytics)
      .where(gte(visitorAnalytics.createdAt, since))
      .groupBy(sql`date_trunc('day', ${visitorAnalytics.createdAt})`)
      .orderBy(sql`date_trunc('day', ${visitorAnalytics.createdAt})`);

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
      periodDays: periodDays === 0 ? "all" : periodDays,
      generatedAt: now.toISOString(),
      totals: totals ?? null,
      registrationsByDay: registrationRows,
      events: eventRows,
      visitors: {
        totals: visitorTotals ?? { pageViews: 0, uniqueVisitors: 0, sessions: 0, anonymousPageViews: 0, registeredPageViews: 0 },
        bySource: sourceRows,
        byCountry: countryRows,
        byDevice: deviceRows,
        byBrowser: browserRows,
        byOs: osRows,
        byDay: visitorDailyRows,
      },
      content: content ?? { channels: 0, groups: 0 },
      notes: {
        activeUsers:
          "Based on lastSeenAt; represents authenticated activity, not page visits.",
        events:
          "Counts only events already recorded in analytics_events.",
        registrations:
          "Historical registrations are available from profiles.createdAt.",
        visitors:
          "Visitor analytics starts after explicit analytics consent; older anonymous visits cannot be reconstructed. IP addresses are not stored.",
      },
    });
  } catch (error) {
    return toResponse(error);
  }
}
