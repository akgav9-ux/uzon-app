"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Heart, MessageCircle, MoreHorizontal, PlayCircle, Send, Trash2, Flag, Ban } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/components/providers";
import { Avatar, Button, EmptyState, ErrorState, IconButton, Input, Menu, MenuItem, Modal, Skeleton, Textarea } from "@/components/ui";
import { del, get, post as postApi, qk } from "@/lib/client/api";
import type { PostPayload } from "@/lib/serialize";
import { cn } from "@/lib/utils";

export type { PostPayload };

export function PostSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export function PostCard({ post, source = "feed" }: { post: PostPayload; source?: string }) {
  const { t, fmt, user, toast, locale } = useApp();
  const queryClient = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const likeMutation = useMutation({
    mutationFn: () => postApi<{ liked: boolean; likeCount: number }>(`/api/posts/${post.id}/actions`, { action: "like", source }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["feed"] });
      return null;
    },
    onSuccess: (data) => {
      queryClient.setQueriesData<{ posts?: PostPayload[] }>({}, (old) => {
        if (!old?.posts) return old;
        return {
          ...old,
          posts: old.posts.map((p) => (p.id === post.id ? { ...p, likedByViewer: data.liked, likeCount: data.likeCount } : p)),
        };
      });
    },
    onError: () => toast(t("common.error"), "error"),
  });

  const saveMutation = useMutation({
    mutationFn: () => postApi(`/api/posts/${post.id}/actions`, { action: post.savedByViewer ? "unsave" : "save" }),
    onSuccess: () => {
      toast(post.savedByViewer ? t("common.saved") : t("post.saved"), "success");
      queryClient.invalidateQueries({ queryKey: qk.saved });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => del(`/api/posts/${post.id}`),
    onSuccess: () => {
      toast(t("post.deleted"), "success");
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const blockMutation = useMutation({
    mutationFn: (action: "block") => postApi(`/api/users/${post.author.username}/actions`, { action }),
    onSuccess: () => {
      toast(t("common.block"), "success");
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const comments = useQuery({
    queryKey: qk.comments("post", post.id),
    queryFn: () => get<{ comments: CommentRow[] }>(`/api/comments?entityType=post&entityId=${post.id}`),
    enabled: showComments,
  });

  return (
    <article className="animate-fade-up rounded-2xl border border-line bg-surface">
      <header className="flex items-start gap-3 px-4 pt-3.5">
        <Link href={`/u/${post.author.username}`} className="shrink-0">
          <Avatar name={post.author.displayName} url={post.author.avatarUrl} size={40} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link href={`/u/${post.author.username}`} className="truncate text-sm font-semibold text-ink hover:underline">
              {post.author.displayName}
            </Link>
            {post.author.isCreator && <span className="text-[10px] text-brand">✦</span>}
          </div>
          <p className="truncate text-[11px] text-muted">
            @{post.author.username} · {fmt.relative(post.createdAt)}
            {post.audience !== "public" && ` · ${t(`settings.audience${post.audience === "followers" ? "Followers" : post.audience === "contacts" ? "Contacts" : "Private"}` as never)}`}
          </p>
        </div>
        {post.conversation && (
          <Link href={`/c/${post.conversation.slug ?? post.conversation.id}`}>
            <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-muted hover:text-brand">
              {post.conversation.title}
            </span>
          </Link>
        )}
        <Menu
          trigger={({ toggle }) => (
            <IconButton label={t("common.edit")} onClick={toggle}>
              <MoreHorizontal className="h-4 w-4" />
            </IconButton>
          )}
        >
          <MenuItem icon={<Flag className="h-3.5 w-3.5" />} onClick={() => setReportOpen(true)}>
            {t("common.report")}
          </MenuItem>
          {post.author.id !== user?.id && (
            <MenuItem icon={<Ban className="h-3.5 w-3.5" />} tone="danger" onClick={() => blockMutation.mutate("block")}>
              {t("common.block")} @{post.author.username}
            </MenuItem>
          )}
          {post.isMine && (
            <MenuItem icon={<Trash2 className="h-3.5 w-3.5" />} tone="danger" onClick={() => deleteMutation.mutate()}>
              {t("common.delete")}
            </MenuItem>
          )}
        </Menu>
      </header>

      {post.text && <p className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed text-ink">{post.text}</p>}

      {post.media.length > 0 && (
        <div className={cn("grid gap-0.5 overflow-hidden rounded-t-none", post.media.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
          {post.media.slice(0, 4).map((m) =>
            m.kind === "video" ? (
              <Link key={m.id} href={post.video ? `/videos/${post.video.id}` : "/clips"} className="relative block bg-black">
                <video src={m.url} muted playsInline preload="metadata" className="max-h-[420px] w-full object-cover" />
                <PlayCircle className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 text-white/80" />
              </Link>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={m.id}
                src={m.url}
                alt={post.text?.slice(0, 80) ?? "UZON media"}
                loading="lazy"
                className="max-h-[520px] w-full bg-surface2 object-cover"
              />
            ),
          )}
        </div>
      )}

      {post.video && post.media.length === 0 && (
        <Link href={post.video.kind === "clip" ? "/clips" : `/videos/${post.video.id}`} className="mx-4 mb-2 flex items-center gap-3 rounded-xl border border-line bg-surface2 p-3">
          <PlayCircle className="h-8 w-8 text-brand" />
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-ink">{post.video.title}</span>
            <span className="block text-[11px] text-muted">
              {fmt.number(post.video.viewCount)} {t("video.views")} · {fmt.duration(post.video.durationMs)}
            </span>
          </span>
        </Link>
      )}

      <div className="flex items-center gap-1 px-2 py-2">
        <ActionButton
          active={post.likedByViewer}
          label={t("post.comment")}
          onClick={() => likeMutation.mutate()}
          pending={likeMutation.isPending}
          icon={<Heart className={cn("h-[18px] w-[18px]", post.likedByViewer && "fill-danger text-danger")} />}
          text={fmt.number(post.likeCount)}
        />
        <ActionButton
          label={t("post.comments")}
          onClick={() => setShowComments((v) => !v)}
          icon={<MessageCircle className="h-[18px] w-[18px]" />}
          text={fmt.number(post.commentCount)}
        />
        <ActionButton
          label={t("common.save")}
          active={post.savedByViewer}
          onClick={() => saveMutation.mutate()}
          icon={<Bookmark className={cn("h-[18px] w-[18px]", post.savedByViewer && "fill-brand text-brand")} />}
        />
        <ActionButton
          label={t("common.share")}
          onClick={() => {
            const url = `${window.location.origin}/post/${post.id}`;
            void navigator.clipboard?.writeText(url);
            toast(t("common.copied"), "success");
          }}
          icon={<Send className="h-[18px] w-[18px]" />}
        />
      </div>

      {showComments && (
        <div className="border-t border-line px-4 py-3">
          {comments.isLoading && <Skeleton className="h-16 w-full" />}
          {comments.isError && <ErrorState message={t("common.error")} onRetry={() => comments.refetch()} />}
          {comments.data && comments.data.comments.length === 0 && (
            <p className="py-2 text-xs text-muted">{t("post.noComments")}</p>
          )}
          <div className="space-y-3">
            {comments.data?.comments.map((comment) => (
              <div key={comment.id} className="flex gap-2.5">
                <Avatar name={comment.author.displayName} url={comment.author.avatarUrl} size={30} />
                <div className="min-w-0 flex-1 rounded-xl bg-surface2 px-3 py-2">
                  <p className="text-xs font-semibold text-ink">
                    <Link href={`/u/${comment.author.username}`} className="hover:underline">
                      {comment.author.displayName}
                    </Link>
                    <span className="ml-2 font-normal text-muted">{fmt.relative(comment.createdAt)}</span>
                  </p>
                  <p className="text-sm text-ink">{comment.text}</p>
                </div>
              </div>
            ))}
          </div>
          {post.commentsEnabled ? (
            <CommentForm
              entityType="post"
              entityId={post.id}
              onDone={() => {
                queryClient.invalidateQueries({ queryKey: qk.comments("post", post.id) });
                queryClient.invalidateQueries({ queryKey: ["feed"] });
              }}
            />
          ) : (
            <p className="pt-3 text-xs text-muted">{t("chat.noPermission")}</p>
          )}
        </div>
      )}

      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} entityType="post" entityId={post.id} locale={locale} />
      {deleteMutation.isPending && <div className="px-4 pb-3 text-xs text-muted">{t("common.loading")}</div>}
      {blockMutation.isPending && <div className="px-4 pb-3 text-xs text-muted">{t("common.loading")}</div>}
    </article>
  );
}

export type CommentRow = {
  id: string;
  text: string;
  likeCount: number;
  likedByViewer?: boolean;
  createdAt: string;
  isMine?: boolean;
  author: { id: string; username: string; displayName: string; avatarUrl: string | null };
};

function ActionButton({
  icon,
  text,
  label,
  onClick,
  active,
  pending,
}: {
  icon: ReactNodeLike;
  text?: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  pending?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      disabled={pending}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition hover:bg-surface2 disabled:opacity-60",
        active ? "text-brand" : "text-muted",
      )}
    >
      {icon}
      {text}
    </button>
  );
}

type ReactNodeLike = Parameters<typeof IconButton>[0]["children"];

export function CommentForm({ entityType, entityId, onDone }: { entityType: "post" | "video"; entityId: string; onDone: () => void }) {
  const { t, toast } = useApp();
  const [text, setText] = useState("");
  const mutation = useMutation({
    mutationFn: () => postApi(`/api/comments`, { entityType, entityId, text }),
    onSuccess: () => {
      setText("");
      onDone();
    },
    onError: (error: Error) => toast(error.message || t("common.error"), "error"),
  });
  return (
    <form
      className="mt-3 flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim()) mutation.mutate();
      }}
    >
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t("post.writeComment")}
        aria-label={t("post.writeComment")}
        maxLength={1000}
      />
      <Button type="submit" size="sm" disabled={!text.trim()} loading={mutation.isPending}>
        {t("common.send")}
      </Button>
    </form>
  );
}

export function ReportModal({
  open,
  onClose,
  entityType,
  entityId,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  entityType: string;
  entityId: string;
  locale?: string;
}) {
  const { t, toast } = useApp();
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  void locale;
  const mutation = useMutation({
    mutationFn: () => postApi("/api/reports", { entityType, entityId, reason, details }),
    onSuccess: () => {
      toast(t("report.sent"), "success");
      setDetails("");
      onClose();
    },
    onError: (error: Error) => toast(error.message, "error"),
  });
  const reasons = [
    { value: "spam", label: t("report.reasonSpam") },
    { value: "harassment", label: t("report.reasonHarassment") },
    { value: "nudity", label: t("report.reasonNudity") },
    { value: "violence", label: t("report.reasonViolence") },
    { value: "copyright", label: t("report.reasonCopyright") },
    { value: "other", label: t("report.reasonOther") },
  ];
  return (
    <Modal open={open} onClose={onClose} title={t("common.report")} footer={<Button onClick={() => mutation.mutate()} loading={mutation.isPending}>{t("report.submit")}</Button>}>
      <div className="space-y-3">
        <div className="grid gap-2">
          {reasons.map((item) => (
            <label key={item.value} className={cn("flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm", reason === item.value ? "border-brand bg-brandsoft" : "border-line")}>
              <input type="radio" name="reason" value={item.value} checked={reason === item.value} onChange={() => setReason(item.value)} className="accent-[var(--brand)]" />
              {item.label}
            </label>
          ))}
        </div>
        <Textarea rows={3} value={details} onChange={(event) => setDetails(event.target.value)} placeholder={t("report.details")} aria-label={t("report.details")} />
      </div>
    </Modal>
  );
}

export function Composer({ onCreated, conversationId, channels }: { onCreated?: () => void; conversationId?: string; channels?: { id: string; title: string; slug: string | null }[] }) {
  const { t, toast, user } = useApp();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [audience, setAudience] = useState<"public" | "followers" | "contacts" | "private">("public");
  const [target, setTarget] = useState<string>("");
  const mutation = useMutation({
    mutationFn: () => postApi<{ post: PostPayload }>("/api/posts", { text, audience, conversationId: target || conversationId || undefined }),
    onSuccess: () => {
      setText("");
      toast(t("create.success"), "success");
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      onCreated?.();
    },
    onError: (error: Error) => toast(error.message, "error"),
  });
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex gap-3">
        <Avatar name={user?.displayName ?? "UZON"} url={user?.avatarUrl} size={38} />
        <div className="flex-1 space-y-2">
          <Textarea
            rows={2}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("feed.newPost")}
            aria-label={t("feed.newPost")}
            maxLength={4000}
          />
          <div className="flex flex-wrap items-center gap-2">
            {channels && channels.length > 0 && (
              <select
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                aria-label={t("create.channel")}
                className="h-9 rounded-lg border border-line bg-surface px-2 text-xs text-ink"
              >
                <option value="">{t("profile.posts")}</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.title}
                  </option>
                ))}
              </select>
            )}
            <select
              value={audience}
              onChange={(event) => setAudience(event.target.value as never)}
              aria-label={t("post.audience")}
              className="h-9 rounded-lg border border-line bg-surface px-2 text-xs text-ink"
            >
              <option value="public">{t("settings.audiencePublic")}</option>
              <option value="followers">{t("settings.audienceFollowers")}</option>
              <option value="contacts">{t("settings.audienceContacts")}</option>
              <option value="private">{t("settings.audiencePrivate")}</option>
            </select>
            <Link href="/create" className="ml-auto text-xs text-brand hover:underline">
              {t("create.photo")} / {t("create.clip")}
            </Link>
            <Button size="sm" onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!text.trim()}>
              {t("common.publish")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PostsEmpty() {
  const { t } = useApp();
  return <EmptyState title={t("feed.empty")} icon={<MessageCircle className="h-8 w-8" />} action={<Link href="/create"><Button size="sm">{t("nav.create")}</Button></Link>} />;
}
