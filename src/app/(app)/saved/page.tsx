"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Clock, PlaySquare } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/components/providers";
import { Button, EmptyState, ErrorState, Skeleton, Tabs } from "@/components/ui";
import { PostCard } from "@/components/post";
import { VideoCard } from "@/components/video";
import { get, qk } from "@/lib/client/api";
import type { PostPayload, VideoPayload } from "@/lib/serialize";

export default function SavedPage() {
  const { t } = useApp();
  const [tab, setTab] = useState<"saved" | "history" | "playlists">("saved");

  const saved = useQuery({
    queryKey: qk.saved,
    queryFn: () => get<{ posts: PostPayload[]; videos: VideoPayload[] }>("/api/saved?type=saved"),
    enabled: tab === "saved",
  });
  const history = useQuery({
    queryKey: qk.history,
    queryFn: () => get<{ history: VideoPayload[] }>("/api/saved?type=history"),
    enabled: tab === "history",
  });
  const playlists = useQuery({
    queryKey: qk.playlists,
    queryFn: () => get<{ playlists: { id: string; title: string; kind: string; itemCount: number }[] }>("/api/playlists"),
    enabled: tab === "playlists",
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
          <Bookmark className="h-5 w-5 text-brand" />
          {t("nav.saved")}
        </h1>
        <p className="text-xs text-muted">{t("video.playlists")} · {t("video.history")}</p>
      </header>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "saved", label: t("nav.saved") },
          { value: "history", label: t("video.history"), icon: <Clock className="h-3.5 w-3.5" /> },
          { value: "playlists", label: t("video.playlists"), icon: <PlaySquare className="h-3.5 w-3.5" /> },
        ]}
      />

      {tab === "saved" && (
        <>
          {saved.isLoading && <Skeleton className="h-32 w-full" />}
          {saved.isError && <ErrorState message={t("common.error")} onRetry={() => saved.refetch()} />}
          {saved.data && saved.data.posts.length === 0 && saved.data.videos.length === 0 && (
            <EmptyState title={t("common.empty")} description={t("post.saved")} icon={<Bookmark className="h-8 w-8" />} action={<Link href="/videos"><Button size="sm">{t("nav.video")}</Button></Link>} />
          )}
          <div className="space-y-3">
            {saved.data?.posts.map((post) => <PostCard key={post.id} post={post} source="saved" />)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {saved.data?.videos.map((video) => <VideoCard key={video.id} video={video} />)}
          </div>
        </>
      )}

      {tab === "history" && (
        <div className="space-y-2">
          {history.isLoading && <Skeleton className="h-24 w-full" />}
          {history.data?.history.length === 0 && <EmptyState title={t("video.continueWatching")} description={t("common.empty")} />}
          {history.data?.history.map((video) => <VideoCard key={video.id} video={video} layout="row" />)}
        </div>
      )}

      {tab === "playlists" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {playlists.isLoading && <Skeleton className="h-20 w-full" />}
          {playlists.data?.playlists.length === 0 && <EmptyState title={t("video.playlists")} description={t("common.empty")} />}
          {playlists.data?.playlists.map((playlist) => (
            <Link key={playlist.id} href={`/playlists/${playlist.id}`} className="rounded-2xl border border-line bg-surface p-4 hover:border-brand/40">
              <p className="text-sm font-semibold text-ink">{playlist.title}</p>
              <p className="text-[11px] text-muted">
                {playlist.itemCount} · {playlist.kind === "watch_later" ? t("video.watchLater") : t("video.playlists")}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
