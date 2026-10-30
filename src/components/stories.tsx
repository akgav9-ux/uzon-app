"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Eye, Plus, Trash2, X, Flag } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/providers";
import { Avatar, Button, EmptyState, Field, IconButton, Input, Modal, Progress, Select, Skeleton, Textarea } from "@/components/ui";
import { del, get, post as postApi, qk, uploadMedia } from "@/lib/client/api";
import { ReportModal } from "@/components/post";
import { cn } from "@/lib/utils";

export type StoryItem = {
  id: string;
  userId: string;
  author: { id: string; username: string; displayName: string; avatarUrl: string | null };
  mediaUrl: string | null;
  mediaKind: string;
  caption: string | null;
  overlayText: string | null;
  audience: string;
  viewCount: number;
  seenByViewer: boolean;
  isMine: boolean;
  createdAt: string;
  expiresAt: string;
};
type TrayGroup = { userId: string; author: StoryItem["author"]; hasUnseen: boolean; count: number; stories: StoryItem[] };

export function StoryTray({ onOpenCreate }: { onOpenCreate?: () => void }) {
  const { t, user } = useApp();
  const query = useQuery({ queryKey: qk.storyTray, queryFn: () => get<{ tray: TrayGroup[] }>("/api/stories") });
  const [active, setActive] = useState<{ groups: TrayGroup[]; groupIndex: number; storyIndex: number } | null>(null);

  const open = (groups: TrayGroup[], groupIndex: number) => setActive({ groups, groupIndex, storyIndex: 0 });

  if (query.isLoading) {
    return (
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-16 rounded-full" />
        ))}
      </div>
    );
  }

  const groups = query.data?.tray ?? [];
  return (
    <section aria-label={t("feed.stories")}>
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
        <button onClick={onOpenCreate} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
          <span className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-line bg-surface text-muted transition hover:border-brand hover:text-brand">
            <Plus className="h-6 w-6" />
          </span>
          <span className="w-16 truncate text-center text-[10px] text-muted">{t("story.add")}</span>
        </button>
        {user && (
          <button
            onClick={() => {
              const mine = groups.find((g) => g.userId === user.id);
              if (mine) open(groups, groups.indexOf(mine));
              else onOpenCreate?.();
            }}
            className="flex w-16 shrink-0 flex-col items-center gap-1.5"
          >
            <Avatar name={user.displayName} url={user.avatarUrl} size={64} ring={groups.some((g) => g.userId === user.id && g.hasUnseen) ? "story" : null} />
            <span className="w-16 truncate text-center text-[10px] text-muted">{t("story.yourStory")}</span>
          </button>
        )}
        {groups
          .filter((g) => g.userId !== user?.id)
          .map((group, index) => (
            <button key={group.userId} onClick={() => open(groups, index)} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
              <Avatar name={group.author.displayName} url={group.author.avatarUrl} size={64} ring={group.hasUnseen ? "story" : null} />
              <span className="w-16 truncate text-center text-[10px] text-muted">{group.author.displayName}</span>
            </button>
          ))}
      </div>
      {active && (
        <StoryViewer
          groups={active.groups}
          startIndex={active.groupIndex}
          onClose={() => setActive(null)}
        />
      )}
    </section>
  );
}

export function StoryViewer({ groups, startIndex, onClose }: { groups: TrayGroup[]; startIndex: number; onClose: () => void }) {
  const { t, fmt, toast } = useApp();
  const queryClient = useQueryClient();
  const [groupIndex, setGroupIndex] = useState(startIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewers, setViewers] = useState<{ userId: string; username: string; displayName: string; viewedAt: string }[] | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const timer = useRef<number | null>(null);

  const group = groups[groupIndex];
  const story = group?.stories[storyIndex];

  const markViewed = useMutation({
    mutationFn: (id: string) => postApi(`/api/stories/${id}`, { action: "view" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.storyTray }),
  });
  const deleteStory = useMutation({
    mutationFn: (id: string) => del(`/api/stories/${id}`),
    onSuccess: () => {
      toast(t("story.delete"), "success");
      queryClient.invalidateQueries({ queryKey: qk.storyTray });
      next();
    },
  });

  const next = () => {
    setProgress(0);
    if (!group) return onClose();
    if (storyIndex + 1 < group.stories.length) return setStoryIndex(storyIndex + 1);
    if (groupIndex + 1 < groups.length) {
      setStoryIndex(0);
      return setGroupIndex(groupIndex + 1);
    }
    onClose();
  };
  const prev = () => {
    setProgress(0);
    if (storyIndex > 0) return setStoryIndex(storyIndex - 1);
    if (groupIndex > 0) {
      setStoryIndex(0);
      setGroupIndex(groupIndex - 1);
    }
  };

  useEffect(() => {
    if (!story) return;
    markViewed.mutate(story.id);
    const duration = story.mediaKind === "video" ? 15_000 : 6_000;
    const started = Date.now();
    const tick = () => {
      if (paused) return;
      const value = Math.min(100, ((Date.now() - started) / duration) * 100);
      setProgress(value);
      if (value >= 100) next();
    };
    timer.current = window.setInterval(tick, 100);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id, paused]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIndex, storyIndex, groups.length]);

  useEffect(() => {
    if (!story?.isMine) {
      setViewers(null);
      return;
    }
    void get<{ viewers?: { userId: string; username: string; displayName: string; viewedAt: string }[] }>(`/api/stories/${story.id}`).then((data) =>
      setViewers(data.viewers ?? []),
    );
  }, [story?.id, story?.isMine]);

  if (!story) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/95" role="dialog" aria-modal="true" aria-label={t("feed.stories")}>
      <button className="absolute inset-0 h-full w-full cursor-default" onClick={onClose} aria-label={t("common.close")} tabIndex={-1} />
      <div className="relative flex h-full w-full max-w-md flex-col md:h-[92vh] md:rounded-3xl md:border md:border-line">
        <div className="absolute inset-x-0 top-0 z-10 space-y-2 p-3">
          <div className="flex gap-1">
            {group!.stories.map((_, index) => (
              <Progress key={index} value={index < storyIndex ? 100 : index === storyIndex ? progress : 0} className="h-0.5 flex-1 bg-white/25" />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/u/${story.author.username}`} onClick={onClose}>
              <Avatar name={story.author.displayName} url={story.author.avatarUrl} size={32} />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{story.author.displayName}</p>
              <p className="text-[10px] text-white/60">{fmt.relative(story.createdAt)}</p>
            </div>
            {story.isMine ? (
              <IconButton label={t("story.delete")} className="text-white hover:bg-white/10" onClick={() => deleteStory.mutate(story.id)}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            ) : (
              <IconButton label={t("common.report")} className="text-white hover:bg-white/10" onClick={() => setReportOpen(true)}>
                <Flag className="h-4 w-4" />
              </IconButton>
            )}
            <IconButton label={t("common.close")} className="text-white hover:bg-white/10" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black" onClick={() => setPaused((p) => !p)}>
          {story.mediaUrl &&
            (story.mediaKind === "video" ? (
              <video src={story.mediaUrl} className="h-full w-full object-contain" autoPlay playsInline loop muted={paused} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={story.mediaUrl} alt={story.caption ?? t("feed.stories")} className="h-full w-full object-contain" />
            ))}
          {story.overlayText && (
            <p className="pointer-events-none absolute inset-x-6 bottom-24 rounded-xl bg-black/50 px-3 py-2 text-center text-lg font-semibold text-white">
              {story.overlayText}
            </p>
          )}
          <button
            aria-label={t("common.back")}
            onClick={(event) => {
              event.stopPropagation();
              prev();
            }}
            className="absolute left-0 top-0 h-full w-1/3 cursor-w-resize"
          />
          <button
            aria-label={t("common.next")}
            onClick={(event) => {
              event.stopPropagation();
              next();
            }}
            className="absolute right-0 top-0 h-full w-1/3 cursor-e-resize"
          />
          <div className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-white/50">
            <ChevronLeft className="h-5 w-5" />
          </div>
          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-white/50">
            <ChevronRight className="h-5 w-5" />
          </div>
        </div>

        <div className="safe-bottom border-t border-white/10 bg-black/70 px-4 py-3">
          {story.caption && <p className="mb-2 text-sm text-white">{story.caption}</p>}
          {story.isMine ? (
            <div className="flex items-center gap-2 text-xs text-white/80">
              <Eye className="h-4 w-4" />
              <span>
                {t("story.viewers")}: {story.viewCount}
              </span>
              <span className="ml-auto text-white/50">
                {t("story.expires", { hours: Math.max(0, Math.round((new Date(story.expiresAt).getTime() - Date.now()) / 3_600_000)) })}
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-white/50">{t("clips.swipe")}</p>
          )}
          {story.isMine && viewers && (
            <div className="no-scrollbar mt-2 flex max-h-24 gap-2 overflow-y-auto">
              {viewers.length === 0 && <span className="text-xs text-white/50">{t("story.noViewers")}</span>}
              {viewers.map((viewer) => (
                <Link key={viewer.userId} href={`/u/${viewer.username}`} onClick={onClose} className={cn("flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-1")}>
                  <Avatar name={viewer.displayName} size={18} />
                  <span className="text-[10px] text-white/80">@{viewer.username}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} entityType="story" entityId={story.id} />
    </div>
  );
}

export function StoryComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, toast } = useApp();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [overlay, setOverlay] = useState("");
  const [audience, setAudience] = useState("public");
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setCaption("");
    setOverlay("");
    setProgress(0);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(t("create.chooseFile"));
      setProgress(5);
      const kind = file.type.startsWith("video") ? "video" : "image";
      const uploaded = await uploadMedia(file, { purpose: "story", visibility: audience, onProgress: setProgress });
      setProgress(95);
      return postApi<{ story: StoryItem }>("/api/stories", {
        mediaId: uploaded.media.id,
        caption,
        overlayText: overlay,
        audience,
        kind,
      } as never);
    },
    onSuccess: () => {
      toast(t("create.success"), "success");
      queryClient.invalidateQueries({ queryKey: qk.storyTray });
      reset();
      onClose();
    },
    onError: (error: Error) => {
      setProgress(0);
      toast(error.message || t("create.uploadFailed"), "error");
    },
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={t("story.add")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!file}>
            {t("common.publish")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            setFile(selected);
            setPreview(selected ? URL.createObjectURL(selected) : null);
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-44 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-surface2 text-xs text-muted hover:border-brand hover:text-brand"
        >
          {preview ? (
            file?.type.startsWith("video") ? (
              <video src={preview} className="h-40 rounded-xl object-contain" muted playsInline />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt={t("create.preview")} className="h-40 rounded-xl object-contain" />
            )
          ) : (
            <>
              <Plus className="h-6 w-6" />
              {t("create.chooseFile")}
            </>
          )}
        </button>
        <Field label={t("story.overlay")}>
          <Input value={overlay} onChange={(event) => setOverlay(event.target.value)} maxLength={200} placeholder={t("story.overlay")} />
        </Field>
        <Field label={t("story.caption")}>
          <Textarea rows={2} value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={400} />
        </Field>
        <Field label={t("post.audience")}>
          <Select value={audience} onChange={(event) => setAudience(event.target.value)}>
            <option value="public">{t("settings.audiencePublic")}</option>
            <option value="followers">{t("settings.audienceFollowers")}</option>
            <option value="contacts">{t("settings.audienceContacts")}</option>
            <option value="private">{t("settings.audiencePrivate")}</option>
          </Select>
        </Field>
        {mutation.isPending && <Progress value={progress} />}
        <p className="text-[11px] text-muted">{t("story.expires", { hours: 24 })}</p>
        {!open && <EmptyState title={t("common.empty")} />}
      </div>
    </Modal>
  );
}
