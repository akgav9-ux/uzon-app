"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Clapperboard, Eye, Heart, MessageCircle, PlaySquare, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/components/providers";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, Tabs } from "@/components/ui";
import { StatusPill } from "@/components/shell";
import { get, qk } from "@/lib/client/api";
import type { VideoPayload } from "@/lib/serialize";

type Studio = {
  days: number;
  overview: {
    views: number;
    uniqueViewers: number;
    likes: number;
    comments: number;
    watchMs: number;
    watchMsTotal: number;
    followGrowth: number;
    followers: number;
    published: number;
    processing: number;
    postsCount: number;
    totalLikes: number;
    totalViews: number;
    avgRetention: number;
  };
  timeline: { day: string; views: number; likes: number; follows: number; watchMs: number }[];
  sources: { source: string; count: number }[];
  topContent: { entityId: string; views: number }[];
  channels: { id: string; slug: string | null; title: string | null; membersCount: number }[];
  content: VideoPayload[];
};

export default function StudioPage() {
  const { t, fmt, user } = useApp();
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<"overview" | "content" | "analytics" | "channel">("overview");

  const studio = useQuery({ queryKey: qk.studio(days), queryFn: () => get<Studio>(`/api/studio?days=${days}`) });

  if (studio.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (studio.isError || !studio.data) return <ErrorState message={t("common.error")} onRetry={() => studio.refetch()} />;

  const data = studio.data;
  const maxViews = Math.max(1, ...data.timeline.map((point) => point.views));

  const cards = [
    { label: t("studio.views"), value: fmt.number(data.overview.views), icon: <Eye className="h-4 w-4" />, hint: `${t("studio.uniqueViewers")}: ${fmt.number(data.overview.uniqueViewers)}` },
    { label: t("studio.watchTime"), value: fmt.duration(data.overview.watchMsTotal), icon: <PlaySquare className="h-4 w-4" />, hint: `${t("studio.avgRetention")}: ${data.overview.avgRetention}%` },
    { label: t("studio.likes"), value: fmt.number(data.overview.totalLikes), icon: <Heart className="h-4 w-4" />, hint: `${t("studio.period30")}: ${fmt.number(data.overview.likes)}` },
    { label: t("studio.subscribers"), value: fmt.number(data.overview.followers), icon: <Users className="h-4 w-4" />, hint: `${t("studio.followerGrowth")}: ${data.overview.followGrowth >= 0 ? "+" : ""}${data.overview.followGrowth}` },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
            <Sparkles className="h-5 w-5 text-brand" />
            {t("studio.title")}
          </h1>
          <p className="text-xs text-muted">@{user?.username} · {t("studio.noData").split(".")[0]}.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={days} onChange={(event) => setDays(Number(event.target.value))} className="h-9 rounded-lg border border-line bg-surface px-2 text-xs" aria-label={t("studio.period30")}>
            <option value={7}>{t("studio.period7")}</option>
            <option value={30}>{t("studio.period30")}</option>
            <option value={90}>{t("studio.period90")}</option>
          </select>
          <Link href="/create">
            <Button size="sm">{t("studio.upload")}</Button>
          </Link>
        </div>
      </header>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "overview", label: t("studio.overview"), icon: <BarChart3 className="h-3.5 w-3.5" /> },
          { value: "content", label: t("studio.content"), icon: <Clapperboard className="h-3.5 w-3.5" /> },
          { value: "analytics", label: t("studio.analytics") },
          { value: "channel", label: t("studio.channel") },
        ]}
      />

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <Card key={card.label} className="p-4">
                <p className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="text-brand">{card.icon}</span>
                  {card.label}
                </p>
                <p className="mt-1 text-2xl font-semibold text-ink">{card.value}</p>
                <p className="text-[11px] text-muted">{card.hint}</p>
              </Card>
            ))}
          </div>

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">{t("studio.views")}</h2>
              <Badge tone="brand">{data.days}d</Badge>
            </div>
            {data.timeline.length === 0 ? (
              <EmptyState title={t("studio.noData")} />
            ) : (
              <div className="flex h-40 items-end gap-1.5">
                {data.timeline.map((point) => (
                  <div key={point.day} className="group flex flex-1 flex-col items-center gap-1">
                    <span className="text-[9px] text-muted opacity-0 transition group-hover:opacity-100">{point.views}</span>
                    <div className="w-full rounded-t bg-brand/70 transition group-hover:bg-brand" style={{ height: `${Math.max(4, (point.views / maxViews) * 100)}%` }} />
                    <span className="text-[9px] text-muted">{point.day.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="grid gap-3 md:grid-cols-3">
            <Card className="p-4">
              <h3 className="mb-2 text-xs font-semibold text-muted">{t("studio.published")}</h3>
              <p className="text-2xl font-semibold text-ink">{data.overview.published}</p>
              <p className="text-[11px] text-muted">
                {t("studio.processingQueue")}: {data.overview.processing} · {t("profile.posts")}: {data.overview.postsCount}
              </p>
            </Card>
            <Card className="p-4">
              <h3 className="mb-2 text-xs font-semibold text-muted">{t("studio.comments")}</h3>
              <p className="text-2xl font-semibold text-ink">{fmt.number(data.overview.comments)}</p>
              <p className="flex items-center gap-1 text-[11px] text-muted">
                <MessageCircle className="h-3 w-3" /> {t("studio.period30")}
              </p>
            </Card>
            <Card className="p-4">
              <h3 className="mb-2 text-xs font-semibold text-muted">{t("studio.views")}</h3>
              <p className="text-2xl font-semibold text-ink">{fmt.number(data.overview.totalViews)}</p>
              <p className="text-[11px] text-muted">{t("video.views")}</p>
            </Card>
          </div>
        </div>
      )}

      {tab === "content" && (
        <div className="space-y-2">
          {data.content.length === 0 && <EmptyState title={t("video.empty")} action={<Link href="/create"><Button size="sm">{t("studio.upload")}</Button></Link>} />}
          {data.content.map((video) => (
            <Card key={video.id} className="flex items-center gap-3 p-3">
              <Link href={video.kind === "clip" ? "/clips" : `/videos/${video.id}`} className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-black">
                {video.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={video.posterUrl} alt="" className="h-full w-full object-cover" />
                ) : video.url ? (
                  <video src={video.url} muted preload="metadata" className="h-full w-full object-cover" />
                ) : null}
              </Link>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{video.title}</p>
                <p className="text-[11px] text-muted">
                  {fmt.number(video.viewCount)} {t("video.views")} · {fmt.number(video.likeCount)} ♥ · {fmt.number(video.commentCount)} {t("studio.comments").toLowerCase()} · {fmt.relative(video.createdAt)}
                </p>
                <div className="mt-1 flex gap-1.5">
                  <Badge>{video.kind === "clip" ? t("nav.clips") : t("nav.video")}</Badge>
                  <Badge tone="neutral">{t(`category.${video.category}` as never)}</Badge>
                  <StatusPill status={video.status} />
                  {!video.commentsEnabled && <Badge tone="warning">{t("studio.restrictComments")}</Badge>}
                </div>
              </div>
              <Link href={`/videos/${video.id}`}>
                <Button size="sm" variant="ghost">{t("studio.editVideo")}</Button>
              </Link>
            </Card>
          ))}
        </div>
      )}

      {tab === "analytics" && (
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">{t("studio.sources")}</h3>
            {data.sources.length === 0 ? (
              <EmptyState title={t("studio.noData")} />
            ) : (
              <ul className="space-y-2">
                {data.sources.map((source) => (
                  <li key={source.source} className="flex items-center gap-2 text-xs">
                    <span className="w-24 truncate text-muted">{source.source}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface2">
                      <span className="block h-full bg-brand" style={{ width: `${(source.count / Math.max(1, data.sources[0]!.count)) * 100}%` }} />
                    </span>
                    <span className="w-10 text-right tabular-nums text-ink">{source.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">{t("studio.views")} · top</h3>
            {data.topContent.length === 0 ? (
              <EmptyState title={t("studio.noData")} />
            ) : (
              <ul className="space-y-2">
                {data.topContent.map((item) => {
                  const video = data.content.find((entry) => entry.id === item.entityId);
                  return (
                    <li key={item.entityId} className="flex items-center justify-between gap-2 text-xs">
                      <Link href={`/videos/${item.entityId}`} className="min-w-0 flex-1 truncate text-ink hover:text-brand">
                        {video?.title ?? item.entityId.slice(0, 8)}
                      </Link>
                      <span className="tabular-nums text-muted">{fmt.number(item.views)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card className="p-4 md:col-span-2">
            <p className="text-[11px] text-muted">{t("studio.noData")}</p>
          </Card>
        </div>
      )}

      {tab === "channel" && (
        <div className="space-y-3">
          {data.channels.length === 0 && (
            <EmptyState title={t("profile.createChannel")} description={t("studio.designHint")} action={<Link href="/messages"><Button size="sm">{t("chat.createChannel")}</Button></Link>} />
          )}
          {data.channels.map((channel) => (
            <Card key={channel.id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{channel.title}</p>
                <p className="text-[11px] text-muted">
                  {channel.slug ? `/c/${channel.slug}` : t("chat.private")} · {fmt.number(channel.membersCount)} {t("video.subscribers")}
                </p>
              </div>
              <Link href={`/c/${channel.slug ?? channel.id}`}>
                <Button size="sm" variant="secondary">{t("profile.previewChannel")}</Button>
              </Link>
              <Link href={`/messages?id=${channel.id}`}>
                <Button size="sm">{t("chat.info")}</Button>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
