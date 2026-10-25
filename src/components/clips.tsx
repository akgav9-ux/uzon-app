
"use client";

import Link from "next/link";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  Check,
  Copy,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Play,
  Send,
  UserPlus,
  Flag,
  X,
  Share2,
  MessageSquareShare,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers";
import { Avatar, Button, EmptyState, ErrorState, IconButton, Modal, Skeleton, Textarea } from "@/components/ui";
import { CommentForm, ReportModal, type CommentRow } from "@/components/post";
import { get, post as postApi, qk } from "@/lib/client/api";
import type { VideoPayload } from "@/lib/serialize";
import { cn } from "@/lib/utils";

export function ClipFeed() {
  const { t, fmt, toast, user } = useApp();
  const queryClient = useQueryClient();
  const [activeIndex, setActiveIndex] = useState(0);
  const [commentsFor, setCommentsFor] = useState<VideoPayload | null>(null);
  const [reportFor, setReportFor] = useState<VideoPayload | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const query = useInfiniteQuery({
    queryKey: ["clips-feed"],
    queryFn: ({ pageParam }) =>
      get<{ clips: VideoPayload[]; nextCursor: string | null }>(
        `/api/clips?limit=6${pageParam ? `&cursor=${pageParam}` : ""}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  const clips = query.data?.pages.flatMap((page) => page.clips) ?? [];

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            if (!Number.isNaN(index)) setActiveIndex(index);
          }
        });
      },
      { root: containerRef.current, threshold: [0.6, 0.9] },
    );
    itemRefs.current.forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, [clips.length]);

  const goTo = useCallback((index: number) => {
    const node = itemRefs.current[index];
    if (node && containerRef.current) {
      containerRef.current.scrollTo({ top: node.offsetTop, behavior: "smooth" });
      setActiveIndex(index);
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key === "j") goTo(Math.min(clips.length - 1, activeIndex + 1));
      if (event.key === "ArrowUp" || event.key === "k") goTo(Math.max(0, activeIndex - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, clips.length, goTo]);

  useEffect(() => {
    if (query.hasNextPage && activeIndex >= clips.length - 2 && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, clips.length]);

  if (query.isLoading) {
    return <div className="space-y-3"><Skeleton className="h-[70vh] w-full" /></div>;
  }
  if (query.isError) return <ErrorState message={t("common.error")} onRetry={() => query.refetch()} />;
  if (!clips.length) {
    return (
      <EmptyState
        title={t("clips.empty")}
        description={t("clips.maxDuration", { minutes: 5 })}
        icon={<Play className="h-8 w-8" />}
        action={<Link href="/create"><Button size="sm">{t("create.clip")}</Button></Link>}
      />
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className="clip-snap no-scrollbar -mx-3 h-[calc(100dvh-9.5rem)] overflow-y-auto rounded-2xl border border-line bg-black md:-mx-6 md:h-[calc(100dvh-8rem)]"
      >
        {clips.map((clip, index) => (
          <div
            key={clip.id}
            data-index={index}
            ref={(node) => { itemRefs.current[index] = node; }}
            className="relative h-[calc(100dvh-9.5rem)] w-full md:h-[calc(100dvh-8rem)]"
          >
            <ClipItem
              clip={clip}
              active={index === activeIndex}
              onOpenComments={() => setCommentsFor(clip)}
              onReport={() => setReportFor(clip)}
              onLiked={(liked, count) => {
                queryClient.setQueryData(["clips-feed"], (old: typeof query.data) => {
                  if (!old) return old;
                  return {
                    ...old,
                    pages: old.pages.map((page) => ({
                      ...page,
                      clips: page.clips.map((item) =>
                        item.id === clip.id
                          ? { ...item, likedByViewer: liked, likeCount: count }
                          : item,
                      ),
                    })),
                  };
                });
              }}
            />
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-muted">{t("clips.swipe")}</p>
      <ClipComments clip={commentsFor} onClose={() => setCommentsFor(null)} />
      {reportFor && <ReportModal open onClose={() => setReportFor(null)} entityType="video" entityId={reportFor.id} />}
      <span className="sr-only">{fmt.number(clips.length)} {t("clips.title")}</span>
    </>
  );
}

function ClipItem({
  clip,
  active,
  onOpenComments,
  onReport,
  onLiked,
}: {
  clip: VideoPayload;
  active: boolean;
  onOpenComments: () => void;
  onReport: () => void;
  onLiked: (liked: boolean, count: number) => void;
}) {
  const { t, fmt, toast, user } = useApp();
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [liked, setLiked] = useState(clip.likedByViewer);
  const [likeCount, setLikeCount] = useState(clip.likeCount);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const watched = useRef(0);
  const viewSent = useRef(false);
  const lastTick = useRef(Date.now());

  useEffect(() => {
    setLiked(clip.likedByViewer);
    setLikeCount(clip.likeCount);
    watched.current = 0;
    viewSent.current = false;
  }, [clip.id, clip.likedByViewer, clip.likeCount]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    if (active && !paused) {
      element.currentTime = element.currentTime || 0;
      void element.play().catch(() => setPaused(true));
      lastTick.current = Date.now();
    } else {
      element.pause();
      watched.current += Date.now() - lastTick.current;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paused, clip.id]);

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => {
      const element = videoRef.current;
      if (element && !element.paused) {
        watched.current += Date.now() - lastTick.current;
        lastTick.current = Date.now();
        if (watched.current >= 3000 && !viewSent.current) {
          viewSent.current = true;
          void postApi<{ counted: boolean; viewCount: number }>(`/api/videos/${clip.id}/events`, {
            type: "view",
            watchMs: Math.round(watched.current),
            source: "clips",
          })
            .then((result) => {
              if (result.counted) queryClient.invalidateQueries({ queryKey: qk.video(clip.id) });
            })
            .catch(() => { viewSent.current = false; });
        }
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [active, clip.id, queryClient]);

  const likeMutation = useMutation({
    mutationFn: () => postApi<{ liked: boolean; likeCount: number }>(`/api/videos/${clip.id}/actions`, { action: "like", source: "clips" }),
    onSuccess: (data) => {
      setLiked(data.liked);
      setLikeCount(data.likeCount);
      onLiked(data.liked, data.likeCount);
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  const saveMutation = useMutation({
    mutationFn: () => postApi(`/api/videos/${clip.id}/actions`, { action: "save" }),
    onSuccess: () => toast(t("post.saved"), "success"),
    onError: (error: Error) => toast(error.message, "error"),
  });

  const followMutation = useMutation({
    mutationFn: () => postApi(`/api/users/${clip.owner.username}/actions`, { action: "follow" }),
    onSuccess: () => {
      toast(t("video.subscribed"), "success");
      queryClient.invalidateQueries({ queryKey: ["clips-feed"] });
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  const getShareData = () => {
    const url = new URL("/clips", window.location.origin);
    url.searchParams.set("focus", clip.id);
    const message = `Смотри клип «${clip.title || "Без названия"}» в UZON!`;
    return { url: url.toString(), message };
  };

  const copyShareLink = async () => {
    const { url } = getShareData();
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        const success = document.execCommand("copy");
        textArea.remove();
        if (!success) throw new Error("Copy failed");
      }
      setCopied(true);
      toast("Ссылка на клип скопирована", "success");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast("Не удалось скопировать ссылку", "error");
    }
  };

  const shareNative = async () => {
    const { url, message } = getShareData();
    if (typeof navigator.share !== "function") {
      toast("Системная отправка не поддерживается этим браузером", "error");
      return;
    }
    try {
      await navigator.share({ title: clip.title || "Клип UZON", text: message, url });
      setShareOpen(false);
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        toast("Не удалось открыть меню отправки", "error");
      }
    }
  };

  const shareExternal = (service: "telegram" | "whatsapp") => {
    const { url, message } = getShareData();
    const target = service === "telegram"
      ? `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(`${message} ${url}`)}`;
    window.open(target, "_blank", "noopener,noreferrer");
    setShareOpen(false);
  };

  return (
    <div className="relative h-full w-full bg-black" onClick={() => setPaused((p) => !p)}>
      {clip.url ? (
        <video
          ref={videoRef}
          src={clip.url}
          poster={clip.posterUrl ?? undefined}
          className="h-full w-full object-contain"
          loop
          playsInline
          muted={muted}
          preload={active ? "auto" : "metadata"}
          onPlay={() => (lastTick.current = Date.now())}
          onError={() => toast(t("errors.network"), "error")}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-muted">{t("common.error")}</div>
      )}

      {paused && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Play className="h-16 w-16 text-white/70" />
        </span>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 pb-6">
        <div className="pointer-events-auto flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link href={`/u/${clip.owner.username}`} className="flex items-center gap-2">
                <Avatar name={clip.owner.displayName} url={clip.owner.avatarUrl} size={32} />
                <span className="text-sm font-semibold text-white">@{clip.owner.username}</span>
              </Link>
              {clip.owner.id !== user?.id && (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    followMutation.mutate();
                  }}
                  className="rounded-full border border-white/40 px-2 py-0.5 text-[11px] text-white hover:bg-white/15"
                  aria-label={t("profile.follow")}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm text-white">{clip.title}</p>
            {clip.description && <p className="mt-0.5 line-clamp-2 text-xs text-white/70">{clip.description}</p>}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {clip.hashtags.slice(0, 4).map((tag) => (
                <Link key={tag} href={`/search?q=%23${tag}&type=clips`} className="text-[11px] font-medium text-white/85 hover:text-white">
                  #{tag}
                </Link>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-white/60">
              {fmt.number(clip.viewCount)} {t("video.views")} · {fmt.relative(clip.createdAt)}
              {clip.durationMs ? ` · ${fmt.duration(clip.durationMs)}` : ""}
            </p>
          </div>

          <div className="flex flex-col items-center gap-3" onClick={(event) => event.stopPropagation()}>
            <ClipAction
              label={t("post.comment")}
              icon={<Heart className={cn("h-6 w-6", liked && "fill-danger text-danger")} />}
              text={fmt.number(likeCount)}
              onClick={() => likeMutation.mutate()}
            />
            <ClipAction label={t("post.comments")} icon={<MessageCircle className="h-6 w-6" />} text={fmt.number(clip.commentCount)} onClick={onOpenComments} />
            <ClipAction label={t("common.save")} icon={<Bookmark className="h-6 w-6" />} onClick={() => saveMutation.mutate()} />
            <ClipAction label={t("common.share")} icon={<Send className="h-6 w-6" />} onClick={() => setShareOpen(true)} />
            <ClipAction label={muted ? t("call.unmute") : "Mute"} icon={<VolumeIcon muted={muted} />} onClick={() => setMuted((m) => !m)} />
            <ClipAction label={t("common.report")} icon={<MoreHorizontal className="h-6 w-6" />} onClick={onReport} />
          </div>
        </div>
      </div>

      {shareOpen && (
        <div
          className="absolute inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:items-center"
          onClick={(event) => {
            event.stopPropagation();
            setShareOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Поделиться клипом"
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-surface p-4 text-ink shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">Поделиться клипом</h3>
                <p className="mt-1 text-xs text-muted">Отправь друзьям в пару нажатий</p>
              </div>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                aria-label="Закрыть"
                className="rounded-full p-2 text-muted transition hover:bg-surface2 hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <ShareOption icon={<Send className="h-5 w-5" />} label="Telegram" onClick={() => shareExternal("telegram")} />
              <ShareOption icon={<MessageSquareShare className="h-5 w-5" />} label="WhatsApp" onClick={() => shareExternal("whatsapp")} />
              <ShareOption icon={<Copy className="h-5 w-5" />} label={copied ? "Скопировано" : "Копировать ссылку"} onClick={() => void copyShareLink()} />
              <ShareOption
                icon={<Share2 className="h-5 w-5" />}
                label="Другие приложения"
                onClick={() => void shareNative()}
              />
            </div>

            <div className="mt-4 rounded-xl bg-surface2 p-3">
              <p className="line-clamp-2 break-all text-xs text-muted">{getShareData().url}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShareOption({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface2 px-3 py-3 text-sm font-medium text-ink transition hover:border-brand hover:bg-surface"
    >
      <span className="text-brand">{icon}</span>
      <span className="text-center">{label}</span>
    </button>
  );
}

function VolumeIcon({ muted }: { muted: boolean }) {
  return muted ? (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function ClipAction({ icon, text, label, onClick }: { icon: React.ReactNode; text?: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={label}
      className="flex flex-col items-center gap-0.5 text-white transition hover:scale-105"
    >
      <span className="drop-shadow">{icon}</span>
      {text && <span className="text-[10px] font-semibold">{text}</span>}
    </button>
  );
}

function ClipComments({ clip, onClose }: { clip: VideoPayload | null; onClose: () => void }) {
  const { t } = useApp();
  const queryClient = useQueryClient();
  const query = useMutationQuery(clip?.id);
  if (!clip) return null;
  return (
    <Modal open onClose={onClose} title={`${t("post.comments")} · ${clip.title.slice(0, 30)}`} size="md">
      <div className="space-y-3">
        {query.isLoading && <Skeleton className="h-10 w-full" />}
        {query.isError && <ErrorState message={t("common.error")} onRetry={() => query.refetch()} />}
        {query.data?.comments.length === 0 && <p className="py-2 text-xs text-muted">{t("post.noComments")}</p>}
        {query.data?.comments.map((comment: CommentRow) => (
          <div key={comment.id} className="flex gap-2.5">
            <Avatar name={comment.author.displayName} url={comment.author.avatarUrl} size={28} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted">
                <Link href={`/u/${comment.author.username}`} className="font-semibold text-ink hover:underline">
                  {comment.author.displayName}
                </Link>
              </p>
              <p className="text-sm text-ink">{comment.text}</p>
            </div>
          </div>
        ))}
        {clip.commentsEnabled ? (
          <CommentForm
            entityType="video"
            entityId={clip.id}
            onDone={() => {
              query.refetch();
              queryClient.invalidateQueries({ queryKey: ["clips-feed"] });
            }}
          />
        ) : (
          <Textarea rows={1} disabled placeholder={t("chat.noPermission")} />
        )}
      </div>
      <IconButton label={t("common.close")} onClick={onClose} className="sr-only">
        <Flag className="h-4 w-4" />
      </IconButton>
    </Modal>
  );
}

function useMutationQuery(videoId?: string) {
  return useQuery({
    queryKey: ["clip-comments", videoId],
    queryFn: () => get<{ comments: CommentRow[] }>(`/api/comments?entityType=video&entityId=${videoId}`),
    enabled: Boolean(videoId),
  });
}
