"use client";

import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { PlaySquare, Clock, ListVideo } from "lucide-react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/components/providers";
import { Button, EmptyState, ErrorState, Skeleton, Tabs } from "@/components/ui";
import { VideoCard, VideoCardSkeleton } from "@/components/video";
import { get, qk } from "@/lib/client/api";
import type { VideoPayload } from "@/lib/serialize";

type VideoList = { videos: VideoPayload[]; nextCursor: string | null; categories: string[] };

function VideosInner() {
  const { t } = useApp();
  const params = useSearchParams();
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [sort, setSort] = useState<"recent" | "popular" | "views">("recent");
  const [section, setSection] = useState<"browse" | "history" | "later">("browse");

  const query = useInfiniteQuery({
    queryKey: ["videos", category, sort],
    queryFn: ({ pageParam }) =>
      get<VideoList>(`/api/videos?kind=long&sort=${sort}${category ? `&category=${category}` : ""}${pageParam ? `&cursor=${pageParam}` : ""}&limit=12`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const history = useQuery({
    queryKey: qk.history,
    queryFn: () => get<{ history: VideoPayload[] }>("/api/saved?type=history"),
    enabled: section === "history",
  });
  const playlists = useQuery({ queryKey: qk.playlists, queryFn: () => get<{ playlists: { id: string; title: string; kind: string; itemCount: number }[] }>("/api/playlists") });
  const watchLater = useQuery({
    queryKey: ["playlist-items", playlists.data?.playlists.find((p) => p.kind === "watch_later")?.id],
    queryFn: () => get<{ videos: VideoPayload[] }>(`/api/playlists/${playlists.data?.playlists.find((p) => p.kind === "watch_later")?.id}`),
    enabled: section === "later" && Boolean(playlists.data?.playlists.find((p) => p.kind === "watch_later")),
  });

  const videos = query.data?.pages.flatMap((page) => page.videos) ?? [];
  const categories = query.data?.pages[0]?.categories ?? [];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
            <PlaySquare className="h-5 w-5 text-brand" />
            {t("video.title")}
          </h1>
          <p className="text-xs text-muted">{t("landing.feature3")}</p>
        </div>
        <Link href="/create">
          <Button size="sm">{t("studio.upload")}</Button>
        </Link>
      </header>

      <Tabs
        value={section}
        onChange={setSection}
        items={[
          { value: "browse", label: t("video.title"), icon: <PlaySquare className="h-3.5 w-3.5" /> },
          { value: "history", label: t("video.history"), icon: <Clock className="h-3.5 w-3.5" /> },
          { value: "later", label: t("video.watchLater"), icon: <ListVideo className="h-3.5 w-3.5" /> },
        ]}
      />

      {section === "browse" && (
        <>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setCategory("")}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs ${!category ? "border-brand bg-brandsoft text-brand" : "border-line text-muted"}`}
            >
              {t("common.all")}
            </button>
            {categories.map((item) => (
              <button
                key={item}
                onClick={() => setCategory(item)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs ${category === item ? "border-brand bg-brandsoft text-brand" : "border-line text-muted"}`}
              >
                {t(`category.${item}` as never)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {(["recent", "popular", "views"] as const).map((item) => (
              <button
                key={item}
                onClick={() => setSort(item)}
                className={`rounded-lg px-2.5 py-1 text-[11px] ${sort === item ? "bg-surface2 text-ink" : "text-muted"}`}
              >
                {item === "recent" ? t("feed.latest") : item === "popular" ? t("feed.forYou") : t("studio.views")}
              </button>
            ))}
          </div>

          {query.isLoading && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <VideoCardSkeleton key={index} />
              ))}
            </div>
          )}
          {query.isError && <ErrorState message={t("common.error")} onRetry={() => query.refetch()} />}
          {!query.isLoading && videos.length === 0 && (
            <EmptyState title={t("video.empty")} icon={<PlaySquare className="h-8 w-8" />} action={<Link href="/create"><Button size="sm">{t("studio.upload")}</Button></Link>} />
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
          {query.hasNextPage && (
            <div className="flex justify-center py-2">
              <Button variant="secondary" size="sm" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
                {t("common.seeAll")}
              </Button>
            </div>
          )}
        </>
      )}

      {section === "history" && (
        <div className="space-y-2">
          {history.isLoading && <Skeleton className="h-24 w-full" />}
          {!history.isLoading && (history.data?.history.length ?? 0) === 0 && <EmptyState title={t("video.continueWatching")} />}
          {history.data?.history.map((video) => (
            <VideoCard key={video.id} video={video} layout="row" />
          ))}
        </div>
      )}

      {section === "later" && (
        <div className="space-y-2">
          {watchLater.isLoading && <Skeleton className="h-24 w-full" />}
          {!watchLater.isLoading && (watchLater.data?.videos.length ?? 0) === 0 && <EmptyState title={t("video.watchLater")} description={t("common.empty")} />}
          {watchLater.data?.videos.map((video) => (
            <VideoCard key={video.id} video={video} layout="row" />
          ))}
        </div>
      )}
    </div>
  );
}

export default function VideosPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <VideosInner />
    </Suspense>
  );
}
