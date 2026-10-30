"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  Check,
  Expand,
  Heart,
  Maximize2,
  MessageCircle,
  Pause,
  Play,
  Trash2,
  Volume2,
  VolumeX,
  MoreHorizontal,
  Share2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers";
import {
  Avatar,
  Badge,
  Button,
  ErrorState,
  IconButton,
  Menu,
  MenuItem,
  Skeleton,
} from "@/components/ui";
import { del, get, post as postApi, qk } from "@/lib/client/api";
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

export function VideoCard({
  video,
  layout = "grid",
}: {
  video: VideoPayload;
  layout?: "grid" | "row";
}) {
  const { t, fmt, toast } = useApp();
  const queryClient = useQueryClient();
  const href = video.kind === "clip" ? "/clips" : `/videos/${video.id}`;

  const deleteMutation = useMutation({
    mutationFn: () => del(`/api/videos/${video.id}`),
    onSuccess: () => {
      toast(t("common.delete"), "success");
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({
        queryKey: qk.profile(video.owner.username),
      });
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  return (
    <div className="group relative">
      <Link
        href={href}
        className={cn("block", layout === "row" && "flex gap-3")}
      >
        {/* 🔥 Видео: на мобилке растягиваем на всю ширину за счет отрицательных отступов */}
        <div
  className={cn(
    "relative overflow-hidden bg-black",
    layout === "row" 
      ? "w-40 shrink-0 rounded-xl" 
      : "aspect-video w-full rounded-none sm:rounded-xl", // 🔥 Убрали -mx-3
  )}
>
          {video.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.posterUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition group-hover:scale-[1.02]"
            />
          ) : video.url ? (
            <video
              src={video.url}
              muted
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
            />
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
              <span
                className="block h-full bg-brand"
                style={{
                  width: `${Math.min(
                    100,
                    (video.positionMs /
                      Math.max(1, video.durationMs ?? 1)) *
                      100,
                  )}%`,
                }}
              />
            </span>
          )}
        </div>

        {/* 🔥 Текст: отступы px-3, чтобы текст не прилипал к краям на мобилке */}
        <div
          className={cn(
            "mt-2 flex gap-3 px-3 sm:px-0",
            layout === "row" && "mt-0 min-w-0 flex-1 px-0",
          )}
        >
          {layout === "row" && (
            <Avatar
              name={video.owner.displayName}
              url={video.owner.avatarUrl}
              size={36}
              className="mt-0.5 shrink-0"
            />
          )}

          <div className="min-w-0 flex-1">
            <h3
              className={cn(
                "line-clamp-2 text-sm font-semibold leading-snug text-ink group-hover:text-brand sm:text-base",
                layout === "row" && "text-[13px] sm:text-sm",
              )}
            >
              {video.title}
            </h3>

            {layout === "grid" && (
              <p className="mt-1 truncate text-xs text-muted sm:text-[13px]">
                {video.owner.displayName}{" "}
                <span className="opacity-60">@{video.owner.username}</span>
              </p>
            )}

            <p className="mt-1 truncate text-[11px] text-muted sm:text-xs">
              {fmt.number(video.viewCount)} {t("video.views")} ·{" "}
              {fmt.relative(video.createdAt)}
              {video.commentCount > 0 &&
                ` · ${fmt.number(video.commentCount)} ${t("studio.comments").toLowerCase()}`}
            </p>
          </div>
        </div>
      </Link>

      {video.isMine && (
        <div className="absolute right-1 top-1 z-10 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100">
          <Menu
            trigger={({ toggle }) => (
              <IconButton
                label={t("common.edit")}
                onClick={toggle}
                className="bg-black/50 text-white hover:bg-black/70"
              >
                <MoreHorizontal className="h-4 w-4" />
              </IconButton>
            )}
          >
            <MenuItem
              icon={<Trash2 className="h-3.5 w-3.5" />}
              tone="danger"
              onClick={() => deleteMutation.mutate()}
            >
              {t("common.delete")}
            </MenuItem>
          </Menu>
        </div>
      )}
    </div>
  );
}

export function VideoPlayer({
  video,
  viewRegisterMs = 3000,
  source = "videos",
  onEnded,
  onCommentsClick,
  autoPlay = false,
}: {
  video: VideoPayload;
  viewRegisterMs?: number;
  source?: string;
  onEnded?: () => void;
  onCommentsClick?: () => void;
  autoPlay?: boolean;
}) {
  const { t, fmt, toast, user } = useApp();
  const queryClient = useQueryClient();
  const ref = useRef<HTMLVideoElement>(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(
    video.durationMs ? video.durationMs / 1000 : 0,
  );
  const [buffered, setBuffered] = useState(0);
  
  const [showControls, setShowControls] = useState(true);

  const watchedMs = useRef(0);
  const viewSent = useRef(false);
  const lastTick = useRef(Date.now());
  const controlsTimeout = useRef<number | null>(null);

  const shareVideo = async () => {
    const url = `${window.location.origin}/videos/${encodeURIComponent(video.id)}`;
    const text = `Посмотри это видео на UZON: ${video.title}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: video.title, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast(t("common.copied"), "success");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        toast(t("common.copied"), "success");
      } catch { toast(url, "info"); }
    }
  };

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const resume = video.positionMs / 1000;
    if (resume > 5 && (!video.durationMs || resume < video.durationMs / 1000 - 10)) {
      element.currentTime = resume;
      toast(`${t("video.resume")} ${fmt.duration(video.positionMs)}`, "info");
    }
    if (autoPlay) void element.play().catch(() => undefined);
  }, [video.id, video.positionMs, video.durationMs, autoPlay]);

  const sendProgress = useCallback(() => {
    const element = ref.current;
    if (!element || !user) return;
    const positionMs = Math.round(element.currentTime * 1000);
    void postApi(`/api/videos/${video.id}/events`, {
      type: "progress",
      positionMs,
      watchMs: Math.round(watchedMs.current),
    }).catch(() => undefined);
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
    if (viewSent.current || watchedMs.current < viewRegisterMs) return;
    viewSent.current = true;
    void postApi<{ counted: boolean; viewCount: number }>(`/api/videos/${video.id}/events`, {
      type: "view",
      watchMs: Math.round(watchedMs.current),
      source,
    }).then((result) => {
      if (result.counted) queryClient.invalidateQueries({ queryKey: qk.video(video.id) });
    }).catch(() => { viewSent.current = false; });
  }, [queryClient, source, video.id, viewRegisterMs]);

  const likeMutation = useMutation({
    mutationFn: () => postApi<{ liked: boolean; likeCount: number }>(`/api/videos/${video.id}/actions`, { action: "like", source }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.video(video.id) }),
    onError: (error: Error) => toast(error.message, "error"),
  });

  const saveMutation = useMutation({
    mutationFn: (kind: "save" | "later") => postApi(`/api/videos/${video.id}/actions`, { action: kind === "save" ? "save" : "watchLater" }),
    onSuccess: (_data, kind) => {
      toast(kind === "save" ? t("post.saved") : t("video.watchLater"), "success");
      queryClient.invalidateQueries({ queryKey: qk.saved });
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => del(`/api/videos/${video.id}`),
    onSuccess: () => {
      toast(t("common.delete"), "success");
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: qk.profile(video.owner.username) });
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  const [likeState, setLikeState] = useState({ liked: video.likedByViewer, count: video.likeCount });
  useEffect(() => {
    setLikeState({ liked: video.likedByViewer, count: video.likeCount });
  }, [video.likedByViewer, video.likeCount]);

  const handleInteraction = () => {
    setShowControls(true);
    if (controlsTimeout.current) window.clearTimeout(controlsTimeout.current);
    if (playing) {
      controlsTimeout.current = window.setTimeout(() => setShowControls(false), 3000);
    }
  };

  useEffect(() => {
    if (playing) {
      handleInteraction();
    } else {
      setShowControls(true);
    }
    return () => {
      if (controlsTimeout.current) window.clearTimeout(controlsTimeout.current);
    };
  }, [playing]);

  return (
    <div 
      className="overflow-hidden rounded-2xl border border-line bg-black"
      onMouseMove={handleInteraction}
      onTouchStart={handleInteraction}
    >
      <div className="relative aspect-video max-h-[70vh] w-full group">
        {video.url ? (
          <video
            ref={ref}
            src={video.url}
            poster={video.posterUrl ?? undefined}
            className="h-full w-full bg-black object-contain"
            playsInline
            muted={muted}
            onClick={() => {
              const element = ref.current;
              if (!element) return;
              if (element.paused) void element.play();
              else element.pause();
            }}
            onPlay={() => { lastTick.current = Date.now(); setPlaying(true); }}
            onPause={() => { watchedMs.current += Date.now() - lastTick.current; lastTick.current = Date.now(); setPlaying(false); registerView(); }}
            onTimeUpdate={(event) => {
              setCurrent(event.currentTarget.currentTime);
              if (event.currentTarget.buffered.length) setBuffered(event.currentTarget.buffered.end(event.currentTarget.buffered.length - 1));
              if (watchedMs.current >= viewRegisterMs) registerView();
            }}
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || duration)}
            onEnded={() => { watchedMs.current += Date.now() - lastTick.current; registerView(); sendProgress(); onEnded?.(); }}
            onError={() => toast(t("errors.network"), "error")}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface2 text-muted">{t("common.error")}</div>
        )}

        {!playing && video.url && (
          <button
            aria-label={t("video.resume")}
            className="absolute inset-0 flex items-center justify-center bg-black/20"
            onClick={() => void ref.current?.play()}
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/90 text-white shadow-lg">
              <Play className="h-7 w-7" />
            </span>
          </button>
        )}

        <div 
          className={cn(
            "absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-3 pt-10 transition-opacity duration-300",
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          <div
            className="relative mb-3 h-1.5 w-full cursor-pointer rounded-full bg-white/30"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const ratio = (event.clientX - rect.left) / rect.width;
              if (ref.current && duration) ref.current.currentTime = ratio * duration;
            }}
          >
            <span className="absolute inset-y-0 left-0 rounded-full bg-white/40" style={{ width: `${(buffered / (duration || 1)) * 100}%` }} />
            <span className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${(current / (duration || 1)) * 100}%` }} />
          </div>

          <div className="flex items-center gap-1.5 text-white">
            <IconButton label={playing ? "Pause" : "Play"} onClick={() => ref.current?.paused ? void ref.current.play() : ref.current?.pause()} className="text-white hover:bg-white/20">
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </IconButton>
            <IconButton label={muted ? "Unmute" : "Mute"} onClick={() => setMuted((m) => !m)} className="text-white hover:bg-white/20">
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </IconButton>
            <span className="ml-1 text-[11px] tabular-nums text-white/80">
              {fmt.duration(current * 1000)} / {fmt.duration(duration * 1000)}
            </span>

            <div className="ml-auto flex items-center gap-1">
              <Button size="sm" variant={likeState.liked ? "primary" : "ghost"} className={cn("text-white hover:bg-white/20", likeState.liked && "bg-brand text-white")} icon={<Heart className={cn("h-4 w-4", likeState.liked && "fill-white")} />} onClick={() => likeMutation.mutate(undefined, { onSuccess: (data) => setLikeState({ liked: data.liked, count: data.likeCount }) })}>
                {fmt.number(likeState.count)}
              </Button>
              <IconButton label={t("common.share")} onClick={() => void shareVideo()} className="text-white hover:bg-white/20">
                <Share2 className="h-5 w-5" />
              </IconButton>
              <IconButton label={t("common.save")} onClick={() => saveMutation.mutate("save")} className="text-white hover:bg-white/20">
                <Bookmark className={cn("h-5 w-5", video.savedByViewer && "fill-brand text-brand")} />
              </IconButton>
              <IconButton label={t("post.comments")} onClick={() => {
                if (onCommentsClick) {
                  onCommentsClick();
                  window.setTimeout(() => document.getElementById("video-comments")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
                  return;
                }
                document.getElementById("video-comments")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }} className="text-white hover:bg-white/20">
                <MessageCircle className="h-5 w-5" />
              </IconButton>
              <IconButton label={t("video.fullscreen")} onClick={() => {
                const element = ref.current;
                if (!element) return;
                if (document.fullscreenElement) void document.exitFullscreen();
                else void element.requestFullscreen?.().catch(() => toast(t("common.error"), "error"));
              }} className="text-white hover:bg-white/20">
                <Maximize2 className="h-5 w-5" />
              </IconButton>
            </div>
          </div>
        </div>
      </div>

      {likeMutation.isError && <ErrorState message={t("common.error")} />}
    </div>
  );
}

export function VideoMeta({ video }: { video: VideoPayload }) {
  const { t, fmt } = useApp();

  return (
    <div className="space-y-3 pt-3">
      <h1 className="text-base font-bold leading-tight text-ink sm:text-lg md:text-xl">
        {video.title}
      </h1>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{fmt.number(video.viewCount)} {t("video.views")}</span>
        <span>•</span>
        <span>{fmt.date(video.createdAt)}</span>
        <Badge tone="brand">{t(`category.${video.category}` as never)}</Badge>
        {video.status !== "ready" && (
          <Badge tone="warning">{t("video.processing")}</Badge>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 py-1">
        <Link href={`/u/${video.owner.username}`} className="flex min-w-0 flex-1 items-center gap-2.5">
          <Avatar name={video.owner.displayName} url={video.owner.avatarUrl} size={38} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">
              {video.owner.displayName}
            </span>
            <span className="block text-[11px] text-muted">
              @{video.owner.username}
            </span>
          </span>
        </Link>
        <div className="shrink-0">
          <FollowButton userId={video.owner.id} username={video.owner.username} />
        </div>
      </div>

      {video.description && (
        <div className="whitespace-pre-wrap rounded-xl bg-surface2 p-3 text-sm text-ink sm:p-4">
          {video.description}
        </div>
      )}

      {video.hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {video.hashtags.map((tag) => (
            <Link
              key={tag}
              href={`/search?q=%23${tag}&type=videos`}
              className="rounded-full border border-line px-2.5 py-1 text-[11px] text-brand hover:bg-brandsoft"
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function FollowButton({
  userId,
  username,
  initial,
}: {
  userId?: string;
  username: string;
  initial?: boolean;
}) {
  const { t, toast, user } = useApp();
  const queryClient = useQueryClient();
  const [following, setFollowing] = useState(initial ?? false);

  const profile = useQuery({
    queryKey: qk.profile(username),
    queryFn: () =>
      get<{ profile: { isFollowing: boolean; isSelf: boolean } }>(
        `/api/users/${username}`,
      ),
    enabled: initial === undefined,
  });

  useEffect(() => {
    if (profile.data) setFollowing(profile.data.profile.isFollowing);
  }, [profile.data]);

  const mutation = useMutation({
    mutationFn: () =>
      postApi(`/api/users/${username}/actions`, {
        action: following ? "unfollow" : "follow",
      }),
    onSuccess: () => {
      setFollowing((value) => !value);
      queryClient.invalidateQueries({ queryKey: qk.profile(username) });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  void userId;

  if (profile.data?.profile.isSelf || (!profile.data && user?.username === username)) {
    return null;
  }

  return (
    <Button
      size="sm"
      variant={following ? "secondary" : "primary"}
      onClick={() => mutation.mutate()}
      loading={mutation.isPending}
    >
      {following ? t("video.subscribed") : t("video.subscribe")}
    </Button>
  );
}