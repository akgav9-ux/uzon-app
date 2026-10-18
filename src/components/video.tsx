"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Check, Expand, Heart, Maximize2, MessageCircle, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers";
import { Avatar, Badge, Button, ErrorState, IconButton, Skeleton } from "@/components/ui";
import { get, post as postApi, qk } from "@/lib/client/api";
import type { VideoPayload } from "@/lib/serialize";
import { cn } from "@/lib/utils";

export function VideoCardSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="aspect-video w-full" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-2/5" />
    </div>
  );
}

export function VideoCard({ video, layout = "grid" }: { video: VideoPayload; layout?: "grid" | "row" }) {
  const { t, fmt } = useApp();
  const href = video.kind === "clip" ? "/clips" : `/videos/${video.id}`;
  return (
    <Link
      href={href}
      className={cn("group block", layout === "row" && "flex gap-3")}
    >
      <div className={cn("relative overflow-hidden rounded-xl bg-black", layout === "row" ? "w-40 shrink-0" : "aspect-video w-full")}>
        {video.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
        ) : video.url ? (
          <video src={video.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface2 text-muted">
            <Play className="h-6 w-6" />
          </div>
        )}
        {video.durationMs ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {fmt.duration(video.durationMs)}
          </span>
        ) : null}
        {video.status !== "ready" && (
          <span className="absolute left-1.5 top-1.5">
            <Badge tone="warning">{t("video.processing")}</Badge>
          </span>
        )}
        {video.positionMs > 3000 && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
            <span className="block h-full bg-brand" style={{ width: `${Math.min(100, (video.positionMs / Math.max(1, video.durationMs ?? 1)) * 100)}%` }} />
          </span>
        )}
      </div>
      <div className={cn("mt-2 flex gap-2.5", layout === "row" && "mt-0 min-w-0 flex-1")}>
        {layout === "row" && <Avatar name={video.owner.displayName} url={video.owner.avatarUrl} size={32} className="mt-0.5" />}
        <div className="min-w-0 flex-1">
          <h3 className={cn("line-clamp-2 text-sm font-semibold text-ink group-hover:text-brand", layout === "row" && "text-xs")}>{video.title}</h3>
          {layout === "grid" && (
            <p className="mt-1 truncate text-xs text-muted">
              {video.owner.displayName} <span className="opacity-60">@{video.owner.username}</span>
            </p>
          )}
          <p className="mt-0.5 truncate text-[11px] text-muted">
            {fmt.number(video.viewCount)} {t("video.views")} · {fmt.relative(video.createdAt)}
            {video.commentCount > 0 && ` · ${fmt.number(video.commentCount)} ${t("studio.comments").toLowerCase()}`}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function VideoPlayer({
  video,
  viewRegisterMs = 3000,
  source = "videos",
  onEnded,
  autoPlay = false,
}: {
  video: VideoPayload;
  viewRegisterMs?: number;
  source?: string;
  onEnded?: () => void;
  autoPlay?: boolean;
}) {
  const { t, fmt, toast, user } = useApp();
  const queryClient = useQueryClient();
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(video.durationMs ? video.durationMs / 1000 : 0);
  const [buffered, setBuffered] = useState(0);
  const watchedMs = useRef(0);
  const viewSent = useRef(false);
  const lastTick = useRef(Date.now());

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const resume = video.positionMs / 1000;
    if (resume > 5 && (!video.durationMs || resume < video.durationMs / 1000 - 10)) {
      element.currentTime = resume;
      toast(`${t("video.resume")} ${fmt.duration(video.positionMs)}`, "info");
    }
    if (autoPlay) void element.play().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id, video.positionMs, video.durationMs, autoPlay]);

  const sendProgress = useCallback(() => {
    const element = ref.current;
    if (!element || !user) return;
    const positionMs = Math.round(element.currentTime * 1000);
    void postApi(`/api/videos/${video.id}/events`, { type: "progress", positionMs, watchMs: Math.round(watchedMs.current) }).catch(() => undefined);
  }, [user, video.id]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (ref.current && !ref.current.paused) {
        const elapsed = Date.now() - lastTick.current;
        watchedMs.current += elapsed;
        lastTick.current = Date.now();
        sendProgress();
      } else {
        lastTick.current = Date.now();
      }
    }, 5000);
    return () => {
      window.clearInterval(interval);
      sendProgress();
    };
  }, [sendProgress]);

  const registerView = useCallback(() => {
    if (viewSent.current) return;
    if (watchedMs.current < viewRegisterMs) return;
    viewSent.current = true;
    void postApi<{ counted: boolean; viewCount: number }>(`/api/videos/${video.id}/events`, {
      type: "view",
      watchMs: Math.round(watchedMs.current),
      source,
    })
      .then((result) => {
        if (result.counted) queryClient.invalidateQueries({ queryKey: qk.video(video.id) });
      })
      .catch(() => {
        viewSent.current = false;
      });
  }, [queryClient, source, video.id, viewRegisterMs]);

  const likeMutation = useMutation({
    mutationFn: () => postApi<{ liked: boolean; likeCount: number }>(`/api/videos/${video.id}/actions`, { action: "like", source }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.video(video.id) }),
    onError: (error: Error) => toast(error.message, "error"),
  });

  const saveMutation = useMutation({
    mutationFn: (kind: "save" | "later") =>
      postApi(`/api/videos/${video.id}/actions`, { action: kind === "save" ? "save" : "watchLater" }),
    onSuccess: (_data, kind) => {
      toast(kind === "save" ? t("post.saved") : t("video.watchLater"), "success");
      queryClient.invalidateQueries({ queryKey: qk.saved });
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  const [likeState, setLikeState] = useState({ liked: video.likedByViewer, count: video.likeCount });
  useEffect(() => setLikeState({ liked: video.likedByViewer, count: video.likeCount }), [video.likedByViewer, video.likeCount]);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-black">
      <div className="relative">
        {video.url ? (
          <video
            ref={ref}
            src={video.url}
            poster={video.posterUrl ?? undefined}
            className="aspect-video max-h-[70vh] w-full bg-black object-contain"
            playsInline
            muted={muted}
            onClick={() => {
              const element = ref.current;
              if (!element) return;
              if (element.paused) void element.play();
              else element.pause();
            }}
            onPlay={() => {
              lastTick.current = Date.now();
              setPlaying(true);
            }}
            onPause={() => {
              watchedMs.current += Date.now() - lastTick.current;
              lastTick.current = Date.now();
              setPlaying(false);
              registerView();
            }}
            onTimeUpdate={(event) => {
              setCurrent(event.currentTarget.currentTime);
              if (event.currentTarget.buffered.length) {
                setBuffered(event.currentTarget.buffered.end(event.currentTarget.buffered.length - 1));
              }
              if (watchedMs.current >= viewRegisterMs) registerView();
            }}
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || duration)}
            onEnded={() => {
              watchedMs.current += Date.now() - lastTick.current;
              registerView();
              sendProgress();
              onEnded?.();
            }}
            onError={() => toast(t("errors.network"), "error")}
          />
        ) : (
          <div className="flex h-64 w-full items-center justify-center bg-surface2 text-muted">
            {t("common.error")}
          </div>
        )}
        {!playing && video.url && (
          <button
            aria-label={t("video.resume")}
            className="absolute inset-0 flex items-center justify-center bg-black/30"
            onClick={() => void ref.current?.play()}
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/90 text-white">
              <Play className="h-7 w-7" />
            </span>
          </button>
        )}
      </div>

      <div className="space-y-2 bg-surface px-3 py-2.5">
        <div className="relative h-1.5 w-full cursor-pointer rounded-full bg-surface2"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - rect.left) / rect.width;
            if (ref.current && duration) ref.current.currentTime = ratio * duration;
          }}
          role="slider"
          aria-label={t("video.resume")}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          tabIndex={0}
          onKeyDown={(event) => {
            if (!ref.current) return;
            if (event.key === "ArrowRight") ref.current.currentTime += 5;
            if (event.key === "ArrowLeft") ref.current.currentTime -= 5;
          }}
        >
          <span className="absolute inset-y-0 left-0 rounded-full bg-white/15" style={{ width: `${(buffered / (duration || 1)) * 100}%` }} />
          <span className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${(current / (duration || 1)) * 100}%` }} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <IconButton label={playing ? "Pause" : "Play"} onClick={() => (ref.current?.paused ? void ref.current.play() : ref.current?.pause())}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </IconButton>
          <IconButton label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((m) => !m)}>
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </IconButton>
          <span className="ml-1 text-[11px] tabular-nums text-muted">
            {fmt.duration(current * 1000)} / {fmt.duration(duration * 1000)}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              size="sm"
              variant={likeState.liked ? "primary" : "secondary"}
              icon={<Heart className={cn("h-3.5 w-3.5", likeState.liked && "fill-white")} />}
              onClick={() =>
                likeMutation.mutate(undefined, {
                  onSuccess: (data) => setLikeState({ liked: data.liked, count: data.likeCount }),
                })
              }
            >
              {fmt.number(likeState.count)}
            </Button>
            <IconButton label={t("common.save")} onClick={() => saveMutation.mutate("save")}>
              <Bookmark className={cn("h-4 w-4", video.savedByViewer && "fill-brand text-brand")} />
            </IconButton>
            <IconButton label={t("video.watchLater")} onClick={() => saveMutation.mutate("later")}>
              <Check className="h-4 w-4" />
            </IconButton>
            <IconButton label={t("post.comments")} onClick={() => document.getElementById("video-comments")?.scrollIntoView({ behavior: "smooth" })}>
              <MessageCircle className="h-4 w-4" />
            </IconButton>
            <IconButton
              label={t("video.fullscreen")}
              onClick={() => {
                const element = ref.current;
                if (!element) return;
                if (document.fullscreenElement) void document.exitFullscreen();
                else void element.requestFullscreen?.().catch(() => toast(t("common.error"), "error"));
              }}
            >
              <Maximize2 className="h-4 w-4" />
            </IconButton>
            <IconButton label={t("video.quality")} onClick={() => toast(t("video.processingNote"), "info")}>
              <Expand className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
        {likeMutation.isError && <ErrorState message={t("common.error")} />}
      </div>
    </div>
  );
}

export function VideoMeta({ video }: { video: VideoPayload }) {
  const { t, fmt } = useApp();
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold text-ink md:text-xl">{video.title}</h1>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{fmt.number(video.viewCount)} {t("video.views")}</span>
        <span>•</span>
        <span>{fmt.date(video.createdAt)}</span>
        <Badge tone="brand">{t(`category.${video.category}` as never)}</Badge>
        {video.status !== "ready" && <Badge tone="warning">{t("video.processing")}</Badge>}
      </div>
      <Link href={`/u/${video.owner.username}`} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface p-2.5 hover:border-brand/40">
        <Avatar name={video.owner.displayName} url={video.owner.avatarUrl} size={38} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{video.owner.displayName}</span>
          <span className="block text-[11px] text-muted">@{video.owner.username}</span>
        </span>
        <FollowButton userId={video.owner.id} username={video.owner.username} />
      </Link>
      {video.description && <p className="whitespace-pre-wrap rounded-xl bg-surface2 p-3 text-sm text-ink">{video.description}</p>}
      {video.hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {video.hashtags.map((tag) => (
            <Link key={tag} href={`/search?q=%23${tag}&type=videos`} className="rounded-full border border-line px-2.5 py-1 text-[11px] text-brand hover:bg-brandsoft">
              #{tag}
            </Link>
          ))}
        </div>
      )}
      {video.processingNote && <p className="text-[11px] text-muted">{video.processingNote}</p>}
    </div>
  );
}

export function FollowButton({ userId, username, initial }: { userId?: string; username: string; initial?: boolean }) {
  const { t, toast, user } = useApp();
  const queryClient = useQueryClient();
  const [following, setFollowing] = useState(initial ?? false);
  const profile = useQuery({
    queryKey: qk.profile(username),
    queryFn: () => get<{ profile: { isFollowing: boolean; isSelf: boolean } }>(`/api/users/${username}`),
    enabled: initial === undefined,
  });
  useEffect(() => {
    if (profile.data) setFollowing(profile.data.profile.isFollowing);
  }, [profile.data]);
  const mutation = useMutation({
    mutationFn: () => postApi(`/api/users/${username}/actions`, { action: following ? "unfollow" : "follow" }),
    onSuccess: () => {
      setFollowing((value) => !value);
      queryClient.invalidateQueries({ queryKey: qk.profile(username) });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: (error: Error) => toast(error.message, "error"),
  });
  void userId;
  if (profile.data?.profile.isSelf || (!profile.data && user?.username === username)) return null;
  return (
    <Button size="sm" variant={following ? "secondary" : "primary"} onClick={() => mutation.mutate()} loading={mutation.isPending}>
      {following ? t("video.subscribed") : t("video.subscribe")}
    </Button>
  );
}