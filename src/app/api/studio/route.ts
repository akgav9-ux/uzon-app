import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { analyticsEvents, comments, conversations, follows, likes, posts, videos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ok, toResponse } from "@/lib/http";
import { buildVideosPayload } from "@/lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Creator Studio analytics — every number is aggregated from real rows
 * (analytics_events, likes, comments, follows, video_progress). Nothing is
 * estimated or simulated; when there are no events the API returns zeros.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const url = new URL(req.url);
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 30)));
    const since = new Date(Date.now() - days * 86_400_000);

    const [overview] = await db
      .select({
        views: sql<number>`(select count(*)::int from analytics_events where owner_id = ${user.id} and type='view' and created_at >= ${since})`,
        uniqueViewers: sql<number>`(select count(distinct actor_id)::int from analytics_events where owner_id = ${user.id} and type='view' and created_at >= ${since})`,
        likes: sql<number>`(select count(*)::int from analytics_events where owner_id = ${user.id} and type='like' and created_at >= ${since})`,
        comments: sql<number>`(select count(*)::int from comments c where c.created_at >= ${since} and c.entity_id in (select v.id from videos v where v.owner_id = ${user.id}) and c.entity_type='video')`,
        watchMs: sql<number>`(select coalesce(sum(watch_ms),0)::bigint::int from analytics_events where owner_id = ${user.id} and type='view' and created_at >= ${since})`,
        watchMsTotal: sql<number>`(select coalesce(sum(watch_ms),0)::bigint::int from video_progress vp where vp.video_id in (select v.id from videos v where v.owner_id = ${user.id}))`,
        followEvents: sql<number>`(select count(*)::int from follows where following_id = ${user.id} and created_at >= ${since})`,
        unfollowEvents: sql<number>`(select count(*)::int from analytics_events where owner_id = ${user.id} and type='unfollow' and created_at >= ${since})`,
        published: sql<number>`(select count(*)::int from videos where owner_id = ${user.id} and deleted_at is null and status='ready')`,
        processing: sql<number>`(select count(*)::int from videos where owner_id = ${user.id} and status='processing')`,
        postsCount: sql<number>`(select count(*)::int from posts where author_id = ${user.id} and deleted_at is null)`,
        totalLikes: sql<number>`(select coalesce(sum(like_count),0)::int from videos where owner_id = ${user.id} and deleted_at is null)`,
        totalViews: sql<number>`(select coalesce(sum(view_count),0)::int from videos where owner_id = ${user.id} and deleted_at is null)`,
        durationTotal: sql<number>`(select coalesce(sum(duration_ms),0)::bigint::int from videos where owner_id = ${user.id} and deleted_at is null)`,
      })
      .from(posts)
      .limit(1);

    const timeline = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', created_at), 'YYYY-MM-DD')`,
        views: sql<number>`count(*) filter (where type='view')::int`,
        likes: sql<number>`count(*) filter (where type='like')::int`,
        follows: sql<number>`count(*) filter (where type='follow')::int`,
        watchMs: sql<number>`coalesce(sum(watch_ms) filter (where type='view'),0)::bigint::int`,
      })
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.ownerId, user.id), gte(analyticsEvents.createdAt, since)))
      .groupBy(sql`date_trunc('day', created_at)`)
      .orderBy(sql`date_trunc('day', created_at)`)
      .limit(100);

    const sources = await db
      .select({ source: analyticsEvents.source, count: sql<number>`count(*)::int` })
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.ownerId, user.id), eq(analyticsEvents.type, "view"), gte(analyticsEvents.createdAt, since)))
      .groupBy(analyticsEvents.source)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    const contentRows = await db
      .select()
      .from(videos)
      .where(eq(videos.ownerId, user.id))
      .orderBy(desc(videos.createdAt))
      .limit(50);

    const channels = await db
      .select({ id: conversations.id, slug: conversations.slug, title: conversations.title, membersCount: conversations.membersCount })
      .from(conversations)
      .where(and(eq(conversations.ownerId, user.id), eq(conversations.kind, "channel")))
      .limit(10);

    const topContent = await db
      .select({ entityId: analyticsEvents.entityId, views: sql<number>`count(*)::int` })
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.ownerId, user.id), eq(analyticsEvents.type, "view"), gte(analyticsEvents.createdAt, since)))
      .groupBy(analyticsEvents.entityId)
      .orderBy(desc(sql`count(*)`))
      .limit(5);

    const avgRetention =
      overview?.totalViews && overview?.durationTotal
        ? Math.min(100, Math.round((overview.watchMsTotal / Math.max(1, overview.durationTotal * Math.max(1, overview.totalViews))) * 100 * 10) / 10)
        : 0;

    void likes;
    return ok({
      days,
      overview: {
        views: overview?.views ?? 0,
        uniqueViewers: overview?.uniqueViewers ?? 0,
        likes: overview?.likes ?? 0,
        comments: overview?.comments ?? 0,
        watchMs: overview?.watchMs ?? 0,
        watchMsTotal: overview?.watchMsTotal ?? 0,
        followGrowth: (overview?.followEvents ?? 0) - (overview?.unfollowEvents ?? 0),
        followers: user.followersCount,
        published: overview?.published ?? 0,
        processing: overview?.processing ?? 0,
        postsCount: overview?.postsCount ?? 0,
        totalLikes: overview?.totalLikes ?? 0,
        totalViews: overview?.totalViews ?? 0,
        avgRetention,
      },
      timeline,
      sources,
      topContent,
      channels,
      content: await buildVideosPayload(contentRows, user.id),
    });
  } catch (error) {
    return toResponse(error);
  }
}
