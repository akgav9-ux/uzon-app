"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, ListVideo, Plus } from "lucide-react";
import { use, useState } from "react";
import { useApp } from "@/components/providers";
import { Button, Card, EmptyState, ErrorState, Modal, Skeleton } from "@/components/ui";
import { CommentForm, ReportModal, type CommentRow } from "@/components/post";
import { VideoCard, VideoMeta, VideoPlayer } from "@/components/video";
import { Avatar } from "@/components/ui";
import { get, post as postApi, qk } from "@/lib/client/api";
import type { VideoPayload } from "@/lib/serialize";

type Detail = {
  video: VideoPayload;
  related: VideoPayload[];
  job: { stage: string; status: string; progress: number } | null;
  playlists: { id: string; title: string; kind: string }[];
  playlistIds: string[];
};

export default function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, fmt, toast } = useApp();
  const queryClient = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);

  const detail = useQuery({ queryKey: qk.video(id), queryFn: () => get<Detail>(`/api/videos/${id}`) });
  const comments = useQuery({
    queryKey: qk.comments("video", id),
    queryFn: () => get<{ comments: CommentRow[] }>(`/api/comments?entityType=video&entityId=${id}`),
    enabled: Boolean(detail.data),
  });
  const config = useQuery({ queryKey: qk.config, queryFn: () => get<{ config: { viewRegisterMs: number } }>("/api/config") });

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="aspect-video w-full" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (detail.isError || !detail.data) {
    return <ErrorState message={t("errors.notFound")} onRetry={() => detail.refetch()} />;
  }

  const { video, related, playlists, playlistIds } = detail.data;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <VideoPlayer video={video} viewRegisterMs={config.data?.config.viewRegisterMs ?? 3000} source="videos" autoPlay={false} />
        <VideoMeta video={video} />

        <Card className="p-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">
              {t("post.comments")} · {fmt.number(video.commentCount)}
            </h2>
            <div className="flex gap-1.5">
              <Button size="sm" variant="secondary" icon={<ListVideo className="h-3.5 w-3.5" />} onClick={() => setPlaylistOpen(true)}>
                {t("video.addToPlaylist")}
              </Button>
              <Button size="sm" variant="ghost" icon={<Flag className="h-3.5 w-3.5" />} onClick={() => setReportOpen(true)}>
                {t("common.report")}
              </Button>
            </div>
          </div>
          {video.commentsEnabled ? (
            <CommentForm
              entityType="video"
              entityId={video.id}
              onDone={() => {
                queryClient.invalidateQueries({ queryKey: qk.comments("video", video.id) });
                queryClient.invalidateQueries({ queryKey: qk.video(video.id) });
              }}
            />
          ) : (
            <p className="text-xs text-muted">{t("chat.noPermission")}</p>
          )}
          <div className="mt-4 space-y-3">
            {comments.isLoading && <Skeleton className="h-12 w-full" />}
            {comments.data?.comments.length === 0 && <p className="text-xs text-muted">{t("post.noComments")}</p>}
            {comments.data?.comments.map((comment) => (
              <div key={comment.id} className="flex gap-2.5">
                <Avatar name={comment.author.displayName} url={comment.author.avatarUrl} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs">
                    <Link href={`/u/${comment.author.username}`} className="font-semibold text-ink hover:text-brand">
                      {comment.author.displayName}
                    </Link>
                    <span className="ml-2 text-muted">{fmt.relative(comment.createdAt)}</span>
                  </p>
                  <p className="text-sm text-ink">{comment.text}</p>
                  <button
                    className="mt-1 text-[11px] text-muted hover:text-brand"
                    onClick={() =>
                      postApi<{ liked: boolean; likeCount: number }>(`/api/comments/${comment.id}`, { action: "like" })
                        .then(() => queryClient.invalidateQueries({ queryKey: qk.comments("video", video.id) }))
                        .catch((error: Error) => toast(error.message, "error"))
                    }
                  >
                    ♥ {comment.likeCount}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <aside className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">{t("video.upNext")}</h2>
        {related.length === 0 && <EmptyState title={t("video.empty")} />}
        <div className="space-y-3">
          {related.map((item) => (
            <VideoCard key={item.id} video={item} layout="row" />
          ))}
        </div>
        {playlistIds.length > 0 && (
          <p className="text-[11px] text-muted">
            {t("video.savedToPlaylist", { name: playlists.find((p) => playlistIds.includes(p.id))?.title ?? "" })}
          </p>
        )}
      </aside>

      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} entityType="video" entityId={video.id} />
      <PlaylistModal open={playlistOpen} onClose={() => setPlaylistOpen(false)} videoId={video.id} playlists={playlists} selected={playlistIds} />
    </div>
  );
}

function PlaylistModal({
  open,
  onClose,
  videoId,
  playlists,
  selected,
}: {
  open: boolean;
  onClose: () => void;
  videoId: string;
  playlists: { id: string; title: string; kind: string }[];
  selected: string[];
}) {
  const { t, toast } = useApp();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      queryClient.invalidateQueries({ queryKey: qk.video(videoId) });
      queryClient.invalidateQueries({ queryKey: qk.playlists });
    } catch (error) {
      toast(error instanceof Error ? error.message : t("common.error"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("video.addToPlaylist")}>
      <div className="space-y-3">
        <ul className="space-y-1.5">
          {playlists.map((playlist) => (
            <li key={playlist.id}>
              <button
                disabled={busy}
                onClick={() =>
                  run(() =>
                    postApi(`/api/videos/${videoId}/actions`, {
                      action: selected.includes(playlist.id) ? "removeFromPlaylist" : "addToPlaylist",
                      playlistId: playlist.id,
                    }),
                  )
                }
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs ${selected.includes(playlist.id) ? "border-brand bg-brandsoft text-brand" : "border-line"}`}
              >
                {playlist.title}
                <span>{selected.includes(playlist.id) ? "✓" : "+"}</span>
              </button>
            </li>
          ))}
          {playlists.length === 0 && <p className="text-xs text-muted">{t("common.empty")}</p>}
        </ul>
        <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => run(() => postApi("/api/playlists", { title: title || t("video.playlistNew"), videoId }))} disabled={busy}>
          {t("video.playlistNew")}
        </Button>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("video.playlistNew")} className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm" aria-label={t("video.playlistNew")} />
        <Button
          size="sm"
          onClick={() => run(() => postApi(`/api/videos/${videoId}/actions`, { action: "watchLater" }))}
          disabled={busy}
        >
          {t("video.watchLater")}
        </Button>
      </div>
    </Modal>
  );
}
