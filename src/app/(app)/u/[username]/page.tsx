"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Calendar, Camera, Flag, Mail, MessageCircle, Phone, Settings, Sparkles, UserPlus } from "lucide-react";
import { useApp } from "@/components/providers";
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Modal, Skeleton, Tabs } from "@/components/ui";
import { PostCard } from "@/components/post";
import { VideoCard } from "@/components/video";
import { ReportModal } from "@/components/post";
import { get, post as postApi, patch, qk, uploadMedia } from "@/lib/client/api";
import type { PostPayload, VideoPayload } from "@/lib/serialize";

type UserContent = { posts?: PostPayload[]; videos?: VideoPayload[]; nextCursor: string | null };

type ProfileResponse = {
  profile: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    coverUrl: string | null;
    bio: string | null;
    links: { label: string; url: string }[];
    role: string;
    isCreator: boolean;
    followersCount: number;
    followingCount: number;
    createdAt: string | null;
    lastSeenAt: string | null;
    phone: string | null;
    email: string | null;
    isPrivate: boolean;
    restricted: boolean;
    isSelf: boolean;
    isFollowing: boolean;
    followsYou: boolean;
    blocked: boolean;
    counts: { posts: number; clips: number; videos: number };
    channel: { id: string; slug: string | null; title: string | null; membersCount: number } | null;
  };
};

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { t, fmt, user, toast } = useApp();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"posts" | "clips" | "videos">("posts");
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  // Для загрузки медиа
  const coverInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const profile = useQuery({ queryKey: qk.profile(username), queryFn: () => get<ProfileResponse>(`/api/users/${username}`) });
  const posts = useInfiniteQuery<UserContent>({
    queryKey: ["user-posts", username, tab],
    queryFn: async ({ pageParam }): Promise<UserContent> =>
      tab === "posts"
        ? get<UserContent>(`/api/posts?authorId=${profile.data?.profile.id}${pageParam ? `&cursor=${pageParam}` : ""}`)
        : get<UserContent>(
            `/api/videos?kind=${tab === "clips" ? "clip" : "long"}&ownerId=${profile.data?.profile.id}${pageParam ? `&cursor=${pageParam}` : ""}&limit=12`,
          ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(profile.data?.profile.id),
  });

  const action = useMutation({
    mutationFn: (kind: "follow" | "unfollow" | "block" | "unblock" | "message") => postApi(`/api/users/${username}/actions`, { action: kind }),
    onSuccess: (data, kind) => {
      if (kind === "message") {
        const conversationId = (data as { conversationId: string }).conversationId;
        window.location.href = `/messages?id=${conversationId}`;
        return;
      }
      queryClient.invalidateQueries({ queryKey: qk.profile(username) });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  const call = useMutation({
    mutationFn: (kind: "audio" | "video") => postApi<{ call: { id: string } }>("/api/calls", { calleeId: profile.data?.profile.id, kind }),
    onSuccess: (data) => {
      window.location.href = `/calls/${(data as { call: { id: string } }).call.id}`;
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  // Обновление профиля (обложка / аватар)
  const updateProfile = useMutation({
    mutationFn: (payload: { coverKey?: string; avatarKey?: string }) =>
      patch(`/api/users/${username}/profile`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.profile(username) });
      toast("Профиль обновлён", "success");
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  const handleCoverUpload = async (file: File) => {
    try {
      const uploaded = await uploadMedia(file, { purpose: "image" });
      updateProfile.mutate({ coverKey: uploaded.media.key });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Ошибка загрузки", "error");
    }
  };

  const handleAvatarUpload = async (file: File) => {
    try {
      const uploaded = await uploadMedia(file, { purpose: "image" });
      updateProfile.mutate({ avatarKey: uploaded.media.key });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Ошибка загрузки", "error");
    }
  };

  useEffect(() => {
    if (profile.data) document.title = `${profile.data.profile.displayName} (@${profile.data.profile.username}) · UZON`;
  }, [profile.data]);

  if (profile.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (profile.isError || !profile.data) return <ErrorState message={t("profile.notFound")} onRetry={() => profile.refetch()} />;

  const p = profile.data.profile;
  const postItems = posts.data?.pages.flatMap((page) => page.posts ?? []) ?? [];
  const videoItems = posts.data?.pages.flatMap((page) => page.videos ?? []) ?? [];

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        {/* Обложка */}
        <div className="group relative h-32 w-full bg-surface2 md:h-44">
          {p.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="uz-ornament h-full w-full" />
          )}
          
          {p.isSelf && (
            <>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCoverUpload(file);
                }}
              />
              <button
                onClick={() => coverInputRef.current?.click()}
                className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-lg bg-black/50 px-3 py-1.5 text-xs text-white opacity-0 transition group-hover:opacity-100"
              >
                <Camera className="h-3.5 w-3.5" />
                Изменить обложку
              </button>
            </>
          )}
        </div>

        <div className="px-4 pb-4">
          <div className="-mt-10 flex items-end justify-between gap-3">
            {/* Аватар */}
            <div className="group relative">
              <Avatar name={p.displayName} url={p.avatarUrl} size={84} ring="brand" className="ring-4 ring-surface" />
              {p.isSelf && (
                <>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAvatarUpload(file);
                    }}
                  />
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition group-hover:opacity-100"
                  >
                    <Camera className="h-5 w-5 text-white" />
                  </button>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-10">
              {p.isSelf ? (
                <Link href="/settings">
                  <Button size="sm" variant="secondary" icon={<Settings className="h-3.5 w-3.5" />}>
                    {t("profile.edit")}
                  </Button>
                </Link>
              ) : (
                <>
                  <Button size="sm" variant={p.isFollowing ? "secondary" : "primary"} icon={<UserPlus className="h-3.5 w-3.5" />} onClick={() => action.mutate(p.isFollowing ? "unfollow" : "follow")} loading={action.isPending}>
                    {p.isFollowing ? t("profile.unfollow") : t("profile.follow")}
                  </Button>
                  <Button size="sm" variant="secondary" icon={<MessageCircle className="h-3.5 w-3.5" />} onClick={() => action.mutate("message")}>
                    {t("profile.message")}
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Phone className="h-3.5 w-3.5" />} onClick={() => call.mutate("audio")} aria-label={t("call.audio")} />
                  <Button size="sm" variant="ghost" icon={<Flag className="h-3.5 w-3.5" />} onClick={() => setReportOpen(true)} aria-label={t("common.report")} />
                  <Button size="sm" variant="ghost" icon={<Ban className="h-3.5 w-3.5" />} onClick={() => setBlockOpen(true)} aria-label={t("common.block")} />
                </>
              )}
            </div>
          </div>

          <div className="mt-3">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
              {p.displayName}
              {p.isCreator && <Sparkles className="h-4 w-4 text-brand" />}
              {p.isPrivate && <Badge>{t("profile.private")}</Badge>}
              {(p.role === "admin" || p.role === "moderator") && <Badge tone="warning">{p.role}</Badge>}
            </h1>
            <p className="text-xs text-muted">
              @{p.username}
              {p.followsYou && !p.isSelf ? ` · ${t("profile.following")}` : ""}
              {p.lastSeenAt && !p.isSelf ? ` · ${t("profile.lastSeen", { time: fmt.relative(p.lastSeenAt) })}` : ""}
            </p>
          </div>

          {p.bio && <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{p.bio}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
            <span>
              <b className="text-ink">{fmt.number(p.followersCount)}</b> {t("profile.followers")}
            </span>
            <span>
              <b className="text-ink">{fmt.number(p.followingCount)}</b> {t("profile.following")}
            </span>
            {p.createdAt && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {t("profile.joined", { date: fmt.date(p.createdAt) })}
              </span>
            )}
            {p.phone && (
              <span className="flex items-center gap-1 text-uzgreen">
                <Phone className="h-3.5 w-3.5" />
                {p.phone}
              </span>
            )}
            {p.email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {p.email}
              </span>
            )}
          </div>

          {p.links.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {p.links.map((link) => (
                <a key={link.url} href={link.url} target="_blank" rel="noreferrer noopener" className="rounded-full border border-line px-2.5 py-1 text-[11px] text-brand hover:bg-brandsoft">
                  {link.label}
                </a>
              ))}
            </div>
          )}

          {p.channel && (
            <Link href={`/c/${p.channel.slug ?? p.channel.id}`} className="mt-3 flex items-center justify-between rounded-xl border border-line bg-surface2 px-3 py-2 hover:border-brand/40">
              <span className="text-xs font-semibold text-ink">{p.channel.title}</span>
              <span className="text-[11px] text-muted">
                {fmt.number(p.channel.membersCount)} {t("video.subscribers")}
              </span>
            </Link>
          )}

          {p.restricted && <p className="mt-3 rounded-xl border border-line bg-surface2 px-3 py-2 text-xs text-muted">{t("profile.privateHint")}</p>}
        </div>
      </Card>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "posts", label: t("profile.posts"), count: p.counts.posts },
          { value: "clips", label: t("profile.clips"), count: p.counts.clips },
          { value: "videos", label: t("profile.videos"), count: p.counts.videos },
        ]}
      />

      {posts.isLoading && <Skeleton className="h-40 w-full" />}
      {posts.isError && <ErrorState message={t("common.error")} onRetry={() => posts.refetch()} />}

      {tab === "posts" && (
        <div className="space-y-3">
          {postItems.length === 0 && !posts.isLoading && <EmptyState title={t("common.empty")} description={p.restricted ? t("profile.privateHint") : undefined} />}
          {postItems.map((post) => (
            <PostCard key={post.id} post={post} source="profile" />
          ))}
        </div>
      )}
      {tab !== "posts" && (
        <div className={`grid gap-4 ${tab === "clips" ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
          {videoItems.length === 0 && !posts.isLoading && <EmptyState title={t("video.empty")} />}
          {videoItems.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      )}

      {posts.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" loading={posts.isFetchingNextPage} onClick={() => posts.fetchNextPage()}>
            {t("common.seeAll")}
          </Button>
        </div>
      )}

      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} entityType="user" entityId={p.id} />
      <Modal
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        title={p.blocked ? t("common.unblock") : t("common.block")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBlockOpen(false)}>{t("common.cancel")}</Button>
            <Button
              variant="danger"
              onClick={() => {
                action.mutate(p.blocked ? "unblock" : "block");
                setBlockOpen(false);
              }}
            >
              {t("common.confirm")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          @{p.username} — {p.blocked ? t("common.unblock") : t("chat.blockedUser")}
        </p>
        {user && <p className="mt-2 text-xs text-muted">{t("settings.privacyMessage")}: {t("settings.audienceNobody")}</p>}
      </Modal>
    </div>
  );
}