"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useApp } from "@/components/providers";
import { ErrorState, Skeleton } from "@/components/ui";
import { PostCard } from "@/components/post";
import { get } from "@/lib/client/api";
import type { PostPayload } from "@/lib/serialize";

export default function SinglePostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useApp();
  const query = useQuery({ queryKey: ["post", id], queryFn: () => get<{ post: PostPayload }>(`/api/posts/${id}`) });

  if (query.isLoading) return <Skeleton className="h-52 w-full" />;
  if (query.isError || !query.data?.post) {
    return (
      <div className="space-y-3">
        <Link href="/home" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-brand">
          <ArrowLeft className="h-3.5 w-3.5" /> {t("errors.back")}
        </Link>
        <ErrorState message={t("errors.notFound")} onRetry={() => query.refetch()} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <Link href="/home" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-brand">
        <ArrowLeft className="h-3.5 w-3.5" /> {t("errors.back")}
      </Link>
      <PostCard post={query.data.post} source="permalink" />
    </div>
  );
}
