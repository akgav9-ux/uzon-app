"use client";

import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { PlaySquare, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/components/providers";
import { Avatar, Button, EmptyState, ErrorState, Skeleton, Tabs } from "@/components/ui";
import { Composer, PostCard, PostSkeleton } from "@/components/post";
import { StoryComposer, StoryTray } from "@/components/stories";
import { get, qk } from "@/lib/client/api";
import type { PostPayload, VideoPayload } from "@/lib/serialize";

type FeedResponse = { posts: PostPayload[]; nextCursor: string | null; followingCount: number };
type Suggestions = {
  people: { id: string; username: string; displayName: string; avatarUrl: string | null; followersCount: number; bio: string | null }[];
  channels: { id: string; slug: string | null; title: string | null; description: string | null; membersCount: number }[];
  trending: VideoPayload[];
};

export default function HomePage() {
  const { t, fmt, user } = useApp();
  const [tab, setTab] = useState<"forYou" | "following" | "latest">("forYou");
  const [storyOpen, setStoryOpen] = useState(false);

  const feed = useInfiniteQuery({
    queryKey: ["feed", tab],
    queryFn: ({ pageParam }) => get<FeedResponse>(`/api/feed?tab=${tab}${pageParam ? `&cursor=${pageParam}` : ""}&limit=10`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const suggestions = useQuery({ queryKey: qk.suggestions, queryFn: () => get<Suggestions>("/api/suggestions") });
  const myChannels = useQuery({
    queryKey: ["my-channels"],
    queryFn: () => get<{ conversations: { id: string; title: string | null; slug: string | null }[] }>("/api/conversations?kind=channel"),
  });

  const posts = feed.data?.pages.flatMap((page) => page.posts) ?? [];
  const channels = (myChannels.data?.conversations ?? [])
    .filter((channel) => channel.slug)
    .map((channel) => ({ id: channel.id, title: channel.title ?? "", slug: channel.slug })) as { id: string; title: string; slug: string | null }[];

  return (
    // ИЗМЕНЕНИЕ: добавлен mx-auto max-w-[600px] px-2 pb-24 для мобилки, чтобы контент не прилипал к краям и не скрывался под меню.
    // На десктопе (lg) включается прежняя сетка.
    <div className="mx-auto w-full max-w-[600px] px-2 pb-24 sm:px-4 lg:max-w-none lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:pb-0">
      
      <div className="space-y-4">
        <StoryTray onOpenCreate={() => setStoryOpen(true)} />
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "forYou", label: t("feed.forYou") },
            { value: "following", label: t("feed.following") },
            { value: "latest", label: t("feed.latest") },
          ]}
        />
        {feed.isLoading && (
          <div className="space-y-3">
            <PostSkeleton />
            <PostSkeleton />
          </div>
        )}
        {feed.isError && <ErrorState message={t("common.error")} onRetry={() => feed.refetch()} />}
        {!feed.isLoading && posts.length === 0 && (
          <EmptyState
            title={t("feed.empty")}
            description={t("feed.suggested")}
            icon={<Sparkles className="h-8 w-8" />}
            action={<Link href="/search"><Button size="sm">{t("nav.search")}</Button></Link>}
          />
        )}
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
        {feed.hasNextPage && (
          <div className="flex justify-center py-3">
            <Button variant="secondary" size="sm" loading={feed.isFetchingNextPage} onClick={() => feed.fetchNextPage()}>
              {t("common.seeAll")}
            </Button>
          </div>
        )}
        {feed.isFetching && !feed.isLoading && <Skeleton className="h-24 w-full" />}
      </div>

      <aside className="hidden space-y-4 lg:block">
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Users className="h-4 w-4 text-brand" />
            {t("feed.suggested")}
          </h2>
          {suggestions.isLoading && <Skeleton className="h-20 w-full" />}
          <ul className="space-y-2.5">
            {suggestions.data?.people.slice(0, 4).map((person) => (
              <li key={person.id} className="flex items-center gap-2.5">
                <Avatar name={person.displayName} url={person.avatarUrl} size={36} />
                <Link href={`/u/${person.username}`} className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-ink hover:text-brand">{person.displayName}</span>
                  <span className="block truncate text-[11px] text-muted">
                    @{person.username} · {fmt.number(person.followersCount)} {t("profile.followers").toLowerCase()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">{t("feed.rightRail")}</h2>
          <ul className="space-y-2.5">
            {suggestions.data?.trending.slice(0, 3).map((clip) => (
              <li key={clip.id}>
                <Link href="/clips" className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brandsoft text-brand">
                    <PlaySquare className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-ink">{clip.title}</span>
                    <span className="block text-[11px] text-muted">
                      {fmt.number(clip.viewCount)} {t("video.views")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">{t("search.channels")}</h2>
          <ul className="space-y-2">
            {suggestions.data?.channels.slice(0, 4).map((channel) => (
              <li key={channel.id}>
                <Link href={`/c/${channel.slug ?? channel.id}`} className="block rounded-xl border border-line px-3 py-2 hover:border-brand/40">
                  <span className="block truncate text-xs font-semibold text-ink">{channel.title}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {fmt.number(channel.membersCount)} {t("video.subscribers")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <p className="px-1 text-[11px] text-muted">
          {t("app.slogan")} · {user?.username ? `@${user.username}` : ""}
        </p>
      </aside>

      <StoryComposer open={storyOpen} onClose={() => setStoryOpen(false)} />
    </div>
  );
}