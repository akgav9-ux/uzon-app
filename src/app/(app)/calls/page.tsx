"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Phone, PhoneMissed, Video } from "lucide-react";
import { useApp } from "@/components/providers";
import { Avatar, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { get } from "@/lib/client/api";

type CallRow = {
  id: string;
  kind: string;
  status: string;
  direction: string;
  durationMs: number;
  createdAt: string;
  peer: { id: string; displayName: string; username: string; avatarUrl: string | null };
};

export default function CallsPage() {
  const { t, fmt } = useApp();
  const query = useQuery({
    queryKey: ["call-history"],
    queryFn: () => get<{ history: CallRow[] }>("/api/calls?scope=history"),
    refetchInterval: 10_000,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
          <Phone className="h-5 w-5 text-brand" />
          {t("nav.calls")}
        </h1>
        <p className="text-xs text-muted">{t("call.history")} · {t("call.iceWarning")}</p>
      </header>

      {query.isLoading && <Skeleton className="h-24 w-full" />}
      {query.isError && <ErrorState message={t("common.error")} onRetry={() => query.refetch()} />}
      {query.data?.history.length === 0 && <EmptyState title={t("call.history")} description={t("common.empty")} icon={<Phone className="h-8 w-8" />} />}

      <ul className="space-y-2">
        {query.data?.history.map((call) => (
          <li key={call.id}>
            <Link href={`/calls/${call.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:border-brand/40">
              <Avatar name={call.peer.displayName} url={call.peer.avatarUrl} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{call.peer.displayName}</p>
                <p className="flex items-center gap-1.5 text-[11px] text-muted">
                  {call.status === "missed" ? <PhoneMissed className="h-3 w-3 text-danger" /> : call.kind === "video" ? <Video className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
                  {call.direction === "outgoing" ? "↗" : "↙"} {t(`call.${call.status === "missed" ? "missed" : call.status === "declined" ? "declined" : call.status === "ringing" ? "ringing" : "ended"}` as never)} ·
                  {fmt.relative(call.createdAt)}
                  {call.durationMs > 0 && ` · ${fmt.duration(call.durationMs)}`}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
