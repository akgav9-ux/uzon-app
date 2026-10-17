"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Megaphone, Settings, UserPlus, Users } from "lucide-react";
import { useApp } from "@/components/providers";
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { Composer, PostCard } from "@/components/post";
import { get, post as postApi, qk } from "@/lib/client/api";
import type { PostPayload } from "@/lib/serialize";

type ChannelResponse = {
  channel: {
    id: string;
    slug: string | null;
    title: string | null;
    description: string | null;
    avatarUrl: string | null;
    isPrivate: boolean;
    membersCount: number;
    onlyAdminsCanPost: boolean;
    owner: { id: string; username: string; displayName: string; avatarUrl: string | null } | null;
    admins: { userId: string; role: string; username: string; displayName: string }[];
    myRole: string | null;
    subscribed: boolean;
    canPost: boolean;
  };
  posts: PostPayload[];
  nextCursor: string | null;
};

export default function ChannelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { t, fmt, toast } = useApp();
  const queryClient = useQueryClient();
  const [joined, setJoined] = useState(false);

  const channel = useQuery({ queryKey: qk.channel(slug), queryFn: () => get<ChannelResponse>(`/api/channels/${slug}`) });
  const posts = useInfiniteQuery({
    queryKey: ["channel-posts", slug, joined],
    queryFn: ({ pageParam }) =>
      get<{ posts: PostPayload[]; nextCursor: string | null }>(
        `/api/posts?conversationId=${channel.data?.channel.id}${pageParam ? `&cursor=${pageParam}` : ""}&limit=12`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(channel.data?.channel.id),
  });

  const subscribe = useMutation({
    mutationFn: (action: "join" | "leave") => postApi(`/api/conversations/${channel.data?.channel.id}/members`, { action }),
    onSuccess: (_data, action) => {
      setJoined(action === "join");
      toast(action === "join" ? t("video.subscribed") : t("chat.leave"), "success");
      queryClient.invalidateQueries({ queryKey: qk.channel(slug) });
      queryClient.invalidateQueries({ queryKey: qk.conversations });
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  if (channel.isLoading) return <Skeleton className="h-64 w-full" />;
  if (channel.isError || !channel.data) return <ErrorState message={t("errors.forbidden")} onRetry={() => channel.refetch()} />;

  const c = channel.data.channel;
  const items = posts.data?.pages.flatMap((page) => page.posts) ?? [];

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="uz-pattern h-24 w-full bg-brandsoft md:h-32" />
        <div className="px-4 pb-4">
          <div className="-mt-9 flex items-end justify-between gap-3">
            <Avatar name={c.title ?? "UZON"} url={c.avatarUrl} size={72} className="ring-4 ring-surface" />
            <div className="flex gap-1.5 pt-9">
              {c.subscribed ? (
                <Button size="sm" variant="secondary" onClick={() => subscribe.mutate("leave")} loading={subscribe.isPending}>
                  {t("video.subscribed")}
                </Button>
              ) : (
                <Button size="sm" icon={<UserPlus className="h-3.5 w-3.5" />} onClick={() => subscribe.mutate("join")} loading={subscribe.isPending}>
                  {t("video.subscribe")}
                </Button>
              )}
              {c.canPost && (
                <Link href={`/messages?id=${c.id}`}>
                  <Button size="sm" variant="ghost" icon={<Settings className="h-3.5 w-3.5" />}>
                    {t("chat.info")}
                  </Button>
                </Link>
              )}
            </div>
          </div>
          <h1 className="mt-3 flex items-center gap-2 text-lg font-semibold text-ink">
            <Megaphone className="h-4 w-4 text-brand" />
            {c.title}
            {c.isPrivate && <Badge>{t("chat.private")}</Badge>}
          </h1>
          <p className="text-xs text-muted">{c.slug ? `/c/${c.slug}` : ""} · {fmt.number(c.membersCount)} {t("video.subscribers")}</p>
          {c.description && <p className="mt-2 text-sm text-ink">{c.description}</p>}
          {c.owner && (
            <Link href={`/u/${c.owner.username}`} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-line px-2.5 py-1.5 hover:border-brand/40">
              <Crown className="h-3.5 w-3.5 text-warning" />
              <Avatar name={c.owner.displayName} url={c.owner.avatarUrl} size={22} />
              <span className="text-xs text-ink">{c.owner.displayName}</span>
            </Link>
          )}
          {c.admins.length > 1 && (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
              <Users className="h-3.5 w-3.5" />
              {c.admins.map((admin) => (
                <span key={admin.userId} className="rounded-full border border-line px-2 py-0.5">
                  {admin.displayName} · {admin.role === "owner" ? t("chat.owner") : t("chat.admin")}
                </span>
              ))}
            </p>
          )}
        </div>
      </Card>

      {c.canPost ? (
        <Composer conversationId={c.id} channels={[]} onCreated={() => posts.refetch()} />
      ) : (
        <p className="rounded-xl border border-line bg-surface px-3 py-2 text-xs text-muted">{t("chat.onlyAdmins")}</p>
      )}

      {posts.isLoading && <Skeleton className="h-32 w-full" />}
      {!posts.isLoading && items.length === 0 && <EmptyState title={t("common.empty")} description={t("post.channelPost")} />}
      <div className="space-y-3">
        {items.map((post) => (
          <PostCard key={post.id} post={post} source="channel" />
        ))}
      </div>
      {posts.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" loading={posts.isFetchingNextPage} onClick={() => posts.fetchNextPage()}>
            {t("common.seeAll")}
          </Button>
        </div>
      )}
    </div>
  );
}
