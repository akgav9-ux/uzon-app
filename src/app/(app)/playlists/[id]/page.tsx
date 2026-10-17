"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListVideo, Trash2 } from "lucide-react";
import { useApp } from "@/components/providers";
import { Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { VideoCard } from "@/components/video";
import { del, get, post as postApi, qk } from "@/lib/client/api";
import type { VideoPayload } from "@/lib/serialize";

export default function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, fmt, toast } = useApp();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const query = useQuery({
    queryKey: ["playlist", id],
    queryFn: () => get<{ playlist: { id: string; title: string; kind: string; itemCount: number }; videos: VideoPayload[] }>(`/api/playlists/${id}`),
  });

  const remove = useMutation({
    mutationFn: (videoId: string) => postApi(`/api/playlists/${id}`, { action: "remove", videoId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playlist", id] });
      queryClient.invalidateQueries({ queryKey: qk.playlists });
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  const removePlaylist = useMutation({
    mutationFn: () => del(`/api/playlists/${id}`),
    onSuccess: () => {
      toast(t("common.delete"), "success");
      window.location.href = "/saved";
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  if (query.isLoading) return <Skeleton className="h-64 w-full" />;
  if (query.isError || !query.data) return <ErrorState message={t("errors.notFound")} onRetry={() => query.refetch()} />;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
            <ListVideo className="h-5 w-5 text-brand" />
            {query.data.playlist.title}
          </h1>
          <p className="text-xs text-muted">
            {fmt.number(query.data.playlist.itemCount)} · {query.data.playlist.kind === "watch_later" ? t("video.watchLater") : t("video.playlists")}
          </p>
        </div>
        {confirmDelete ? (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>{t("common.cancel")}</Button>
            <Button size="sm" variant="danger" loading={removePlaylist.isPending} onClick={() => removePlaylist.mutate()}>{t("common.delete")}</Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setConfirmDelete(true)}>
            {t("common.delete")}
          </Button>
        )}
      </header>

      {query.data.videos.length === 0 ? (
        <EmptyState title={t("common.empty")} action={<Link href="/videos"><Button size="sm">{t("nav.video")}</Button></Link>} />
      ) : (
        <div className="space-y-2">
          {query.data.videos.map((video) => (
            <div key={video.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <VideoCard video={video} layout="row" />
              </div>
              <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => remove.mutate(video.id)} aria-label={t("common.delete")} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
