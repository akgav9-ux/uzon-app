"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search as SearchIcon, X } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/components/providers";
import { Avatar, Button, EmptyState, ErrorState, Input, Skeleton, Tabs } from "@/components/ui";
import { PostCard } from "@/components/post";
import { VideoCard } from "@/components/video";
import { get } from "@/lib/client/api";
import type { PostPayload, VideoPayload } from "@/lib/serialize";

type SearchResponse = {
  query: string;
  people: { id: string; username: string; displayName: string; avatarUrl: string | null; bio: string | null; followersCount: number; isPrivate: boolean }[];
  channels: { id: string; slug: string | null; title: string | null; description: string | null; membersCount: number }[];
  groups: { id: string; title: string | null; description: string | null; membersCount: number }[];
  clips: VideoPayload[];
  videos: VideoPayload[];
  posts: PostPayload[];
};

function SearchInner() {
  const { t, fmt } = useApp();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [term, setTerm] = useState(params.get("q") ?? "");
  const [type, setType] = useState(params.get("type") ?? "all");

  useEffect(() => {
    setTerm(params.get("q") ?? term);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const history = useQuery({
    queryKey: ["search-history"],
    queryFn: () => get<{ history: { query: string; searchedAt: string }[] }>("/api/search?history=1"),
  });
  const search = useQuery({
    queryKey: ["search", term, type],
    queryFn: () => get<SearchResponse>(`/api/search?q=${encodeURIComponent(term)}&type=${type}&limit=12`),
    enabled: term.trim().length >= 2,
  });

  const clearHistory = useMutation({
    mutationFn: () => get("/api/search?clearHistory=1"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["search-history"] }),
  });

  useEffect(() => {
    if (search.data) void queryClient.invalidateQueries({ queryKey: ["search-history"] });
  }, [search.data, queryClient]);

  const isEmpty = term.trim().length >= 2 && search.data && !search.data.people.length && !search.data.channels.length && !search.data.clips.length && !search.data.videos.length && !search.data.posts.length;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
          <SearchIcon className="h-5 w-5 text-brand" />
          {t("nav.search")}
        </h1>
        <p className="text-xs text-muted">{t("search.placeholder")}</p>
      </header>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t("search.placeholder")}
          className="pl-10"
          aria-label={t("search.placeholder")}
        />
        {term && (
          <button onClick={() => setTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink" aria-label={t("common.close")}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <Tabs
        value={type}
        onChange={setType}
        items={[
          { value: "all", label: t("common.all") },
          { value: "people", label: t("search.people") },
          { value: "channels", label: t("search.channels") },
          { value: "groups", label: t("search.groups") },
          { value: "clips", label: t("search.clips") },
          { value: "videos", label: t("search.videos") },
          { value: "posts", label: t("search.posts") },
        ]}
      />

      {term.trim().length < 2 && (
        <div className="space-y-3">
          <p className="text-xs text-muted">{t("search.hint")}</p>
          {history.data?.history.length ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-muted">{t("search.recent")}</h2>
                <Button size="sm" variant="ghost" onClick={() => clearHistory.mutate()}>
                  {t("search.clear")}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {history.data.history.map((item) => (
                  <button key={item.query} onClick={() => setTerm(item.query)} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-brand hover:text-brand">
                    {item.query}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState title={t("search.hint")} icon={<SearchIcon className="h-8 w-8" />} />
          )}
        </div>
      )}

      {search.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      )}
      {search.isError && <ErrorState message={t("common.error")} onRetry={() => search.refetch()} />}
      {isEmpty && <EmptyState title={t("search.empty", { query: term })} />}

      {search.data && (
        <div className="space-y-5">
          {(type === "all" || type === "people") && search.data.people.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-ink">{t("search.people")}</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {search.data.people.map((person) => (
                  <li key={person.id}>
                    <Link href={`/u/${person.username}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:border-brand/40">
                      <Avatar name={person.displayName} url={person.avatarUrl} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">
                          {person.displayName} {person.isPrivate && "🔒"}
                        </span>
                        <span className="block truncate text-[11px] text-muted">
                          @{person.username} · {fmt.number(person.followersCount)} {t("profile.followers").toLowerCase()}
                        </span>
                        {person.bio && <span className="mt-0.5 block truncate text-[11px] text-muted">{person.bio}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(type === "all" || type === "channels") && search.data.channels.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-ink">{t("search.channels")}</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {search.data.channels.map((channel) => (
                  <li key={channel.id}>
                    <Link href={`/c/${channel.slug ?? channel.id}`} className="block rounded-2xl border border-line bg-surface p-3 hover:border-brand/40">
                      <span className="block truncate text-sm font-semibold text-ink">{channel.title}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {channel.slug ? `/c/${channel.slug}` : ""} · {fmt.number(channel.membersCount)} {t("video.subscribers")}
                      </span>
                      {channel.description && <span className="mt-1 block line-clamp-2 text-xs text-muted">{channel.description}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(type === "all" || type === "groups") && search.data.groups.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-ink">{t("search.groups")}</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {search.data.groups.map((group) => (
                  <li key={group.id} className="rounded-2xl border border-line bg-surface p-3">
                    <span className="block truncate text-sm font-semibold text-ink">{group.title}</span>
                    <span className="block text-[11px] text-muted">
                      {fmt.number(group.membersCount)} {t("chat.members").toLowerCase()}
                    </span>
                    <Link href={`/messages?id=${group.id}`}>
                      <Button size="sm" variant="secondary" className="mt-2">
                        {t("chat.join")}
                      </Button>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(type === "all" || type === "clips") && search.data.clips.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-ink">{t("search.clips")}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {search.data.clips.map((clip) => (
                  <VideoCard key={clip.id} video={clip} />
                ))}
              </div>
            </section>
          )}

          {(type === "all" || type === "videos") && search.data.videos.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-ink">{t("search.videos")}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {search.data.videos.map((video) => (
                  <VideoCard key={video.id} video={video} />
                ))}
              </div>
            </section>
          )}

          {(type === "all" || type === "posts") && search.data.posts.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-ink">{t("search.posts")}</h2>
              {search.data.posts.map((post) => (
                <PostCard key={post.id} post={post} source="search" />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <SearchInner />
    </Suspense>
  );
}
