"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Flag, ShieldAlert, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/components/providers";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Modal, Skeleton, Tabs, Textarea } from "@/components/ui";
import { get, post as postApi, qk } from "@/lib/client/api";

type ReportRow = {
  report: {
    id: string;
    entityType: string;
    entityId: string;
    reason: string;
    details: string | null;
    status: string;
    createdAt: string;
    resolution: string | null;
  };
  reporterName: string | null;
};
type LogRow = { id: string; action: string; entityType: string | null; entityId: string | null; note: string | null; createdAt: string };
type Stats = {
  openReports: number;
  users: number;
  posts: number;
  videos: number;
  clips: number;
  messages: number;
  channels: number;
  groups: number;
  stories: number;
};

export default function AdminPage() {
  const { t, fmt, user, toast } = useApp();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"open" | "resolved" | "dismissed" | "all">("open");
  const [noteTarget, setNoteTarget] = useState<{ report: ReportRow["report"]; action: string } | null>(null);
  const [note, setNote] = useState("");

  const query = useQuery({ queryKey: qk.reports(status), queryFn: () => get<{ reports: ReportRow[]; log: LogRow[]; stats: Stats | null }>(`/api/admin?status=${status}`) });

  const act = useMutation({
    mutationFn: (payload: { reportId?: string; action: string; note?: string }) => postApi("/api/admin", payload),
    onSuccess: () => {
      toast(t("common.saved"), "success");
      queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      setNoteTarget(null);
      setNote("");
    },
    onError: (error: Error) => toast(error.message, "error"),
  });

  if (user && user.role === "user") {
    return (
      <EmptyState
        title={t("admin.title")}
        description={t("admin.notStaff")}
        icon={<ShieldAlert className="h-8 w-8" />}
        action={<Link href="/home"><Button size="sm">{t("errors.back")}</Button></Link>}
      />
    );
  }
  if (query.isLoading) return <Skeleton className="h-64 w-full" />;
  if (query.isError) return <ErrorState message={t("errors.forbidden")} onRetry={() => query.refetch()} />;

  const data = query.data!;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
          <ShieldAlert className="h-5 w-5 text-brand" />
          {t("admin.title")}
        </h1>
        <p className="text-xs text-muted">{t("admin.queue")} · {t("admin.log")}</p>
      </header>

      {data.stats && (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {(
            [
              [t("admin.open"), data.stats.openReports],
              [t("search.people"), data.stats.users],
              [t("profile.posts"), data.stats.posts],
              [t("nav.clips"), data.stats.clips],
              [t("nav.video"), data.stats.videos],
              [t("nav.messages"), data.stats.messages],
              [t("search.channels"), data.stats.channels],
              [t("search.groups"), data.stats.groups],
              [t("feed.stories"), data.stats.stories],
            ] as [string, number][]
          ).map(([label, value]) => (
            <Card key={label} className="px-3 py-2">
              <p className="text-[11px] text-muted">{label}</p>
              <p className="text-lg font-semibold text-ink">{fmt.number(value)}</p>
            </Card>
          ))}
        </div>
      )}

      <Tabs
        value={status}
        onChange={setStatus}
        items={[
          { value: "open", label: t("admin.open") },
          { value: "resolved", label: t("admin.resolved") },
          { value: "dismissed", label: t("admin.dismissed") },
          { value: "all", label: t("common.all") },
        ]}
      />

      {data.reports.length === 0 ? (
        <EmptyState title={t("admin.empty")} icon={<Flag className="h-8 w-8" />} />
      ) : (
        <ul className="space-y-2">
          {data.reports.map(({ report, reporterName }) => (
            <li key={report.id}>
              <Card className="p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={report.status === "open" ? "warning" : report.status === "resolved" ? "success" : "neutral"}>{report.status}</Badge>
                  <Badge>{report.entityType}</Badge>
                  <Badge tone="danger">{t(`report.reason${report.reason[0]!.toUpperCase()}${report.reason.slice(1)}` as never)}</Badge>
                  <span className="text-[11px] text-muted">
                    {t("admin.reporter")}: @{reporterName ?? "—"} · {fmt.relative(report.createdAt)}
                  </span>
                </div>
                {report.details && <p className="mt-2 text-xs text-ink">{report.details}</p>}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Link href={entityLink(report.entityType, report.entityId)}>
                    <Button size="sm" variant="ghost">{t("admin.target")}</Button>
                  </Link>
                  {report.status === "open" && (
                    <>
                      <Button size="sm" icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => setNoteTarget({ report, action: "resolve" })}>
                        {t("admin.resolve")}
                      </Button>
                      <Button size="sm" variant="secondary" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setNoteTarget({ report, action: "dismiss" })}>
                        {t("admin.dismiss")}
                      </Button>
                      <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setNoteTarget({ report, action: "remove_content" })}>
                        {t("admin.remove")}
                      </Button>
                      {report.entityType === "user" && (
                        <Button size="sm" variant="danger" onClick={() => setNoteTarget({ report, action: "suspend" })}>
                          {t("admin.suspend")}
                        </Button>
                      )}
                    </>
                  )}
                  {report.status !== "open" && report.entityType === "user" && (
                    <Button size="sm" variant="secondary" onClick={() => act.mutate({ reportId: report.id, action: "restore" })}>
                      {t("admin.restore")}
                    </Button>
                  )}
                </div>
                {report.resolution && <p className="mt-2 text-[11px] text-muted">{t("admin.note")}: {report.resolution}</p>}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">{t("admin.log")}</h2>
        {data.log.length === 0 ? (
          <p className="text-xs text-muted">{t("common.empty")}</p>
        ) : (
          <ul className="space-y-1.5">
            {data.log.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[11px]">
                <Badge>{entry.action}</Badge>
                {entry.entityType && <span className="text-muted">{entry.entityType}</span>}
                {entry.note && <span className="text-ink">{entry.note}</span>}
                <span className="ml-auto text-muted">{fmt.relative(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={Boolean(noteTarget)}
        onClose={() => setNoteTarget(null)}
        title={`${t("admin.note")} · ${noteTarget?.action ?? ""}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNoteTarget(null)}>{t("common.cancel")}</Button>
            <Button
              loading={act.isPending}
              onClick={() => noteTarget && act.mutate({ reportId: noteTarget.report.id, action: noteTarget.action, note })}
            >
              {t("common.confirm")}
            </Button>
          </>
        }
      >
        <Field label={t("admin.note")}>
          <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
        </Field>
        <p className="mt-2 text-[11px] text-muted">
          {t("admin.target")}: {noteTarget?.report.entityType} · {noteTarget?.report.entityId}
        </p>
      </Modal>
    </div>
  );
}

function entityLink(entityType: string, entityId: string): string {
  switch (entityType) {
    case "post":
      return `/post/${entityId}`;
    case "video":
      return `/videos/${entityId}`;
    case "user":
      return `/u/${entityId}`;
    case "message":
      return `/messages`;
    case "channel":
    case "group":
      return `/messages?id=${entityId}`;
    default:
      return "/admin";
  }
}
