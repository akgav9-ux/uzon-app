"use client";

import Link from "next/link";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Heart, MessageCircle, Phone, UserPlus, Video } from "lucide-react";
import { useApp } from "@/components/providers";
import { Avatar, Button, EmptyState, ErrorState, IconButton } from "@/components/ui";
import { get, post as postApi, qk } from "@/lib/client/api";
import type { TranslationKey } from "@/lib/i18n";

type Notification = {
  id: string;
  type: string;
  entityType: string | null;
  entityId: string | null;
  preview: string | null;
  groupCount: number;
  read: boolean;
  createdAt: string;
  actor: { id: string; username: string; displayName: string; avatarUrl: string | null } | null;
};

type NotificationsResponse = {
  notifications?: Notification[];
  unread?: number;
  nextCursor?: string | null;
  error?: string;
};

function iconFor(type: string) {
  switch (type) {
    case "like":
    case "reaction":
      return <Heart className="h-4 w-4 text-danger" />;
    case "comment":
    case "reply":
    case "mention":
      return <MessageCircle className="h-4 w-4 text-brand" />;
    case "follow":
      return <UserPlus className="h-4 w-4 text-uzgreen" />;
    case "call":
    case "missedCall":
      return <Phone className="h-4 w-4 text-uzblue" />;
    case "processing":
      return <Video className="h-4 w-4 text-warning" />;
    default:
      return <Bell className="h-4 w-4 text-muted" />;
  }
}

function linkFor(notification: Notification): string | null {
  const { entityType, entityId, actor } = notification;
  if (entityType === "post" && entityId) return `/post/${entityId}`;
  if (entityType === "video" && entityId) return `/videos/${entityId}`;
  if (entityType === "conversation" && entityId) return `/messages?id=${entityId}`;
  if (entityType === "call" && entityId) return `/calls/${entityId}`;
  if (entityType === "channel" && entityId) return `/studio`;
  if (actor) return `/u/${actor.username}`;
  return null;
}

export default function NotificationsPage() {
  const { t, fmt, toast } = useApp();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: qk.notifications,
    queryFn: async ({ pageParam }) => {
      try {
        const raw = await get<NotificationsResponse>(
          `/api/notifications${pageParam ? `?cursor=${pageParam}` : ""}`
        );
        return {
          notifications: Array.isArray(raw?.notifications) ? raw.notifications : [],
          unread: typeof raw?.unread === "number" ? raw.unread : 0,
          nextCursor: raw?.nextCursor ?? null,
        };
      } catch (error) {
        // Если API вернул ошибку (например, 401), возвращаем пустую страницу, чтобы не падать
        return { notifications: [], unread: 0, nextCursor: null };
      }
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last?.nextCursor ?? null,
    refetchInterval: 20_000,
  });

  const markAll = useMutation({
    mutationFn: () => postApi("/api/notifications", { action: "readAll" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.notifications }),
  });
  const markRead = useMutation({
    mutationFn: (ids: string[]) => postApi("/api/notifications", { action: "read", ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.notifications }),
    onError: (error: Error) => toast(error.message, "error"),
  });

  const notifications = query.data?.pages.flatMap((page) => page?.notifications ?? []) ?? [];
  const unread = query.data?.pages[0]?.unread ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-2 pb-24 sm:px-4 lg:px-0 lg:pb-0">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
            <Bell className="h-5 w-5 text-brand" />
            {t("notif.title")}
          </h1>
          <p className="text-xs text-muted">
            {unread > 0 ? `${fmt.number(unread)} · ${t("notif.empty")}` : t("notif.markAll")}
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="secondary" icon={<CheckCheck className="h-3.5 w-3.5" />} onClick={() => markAll.mutate()} loading={markAll.isPending}>
            {t("notif.markAll")}
          </Button>
        </div>
      </header>

      {query.isLoading && <p className="py-10 text-center text-sm text-muted">{t("common.loading")}</p>}
      {query.isError && <ErrorState message={t("common.error")} onRetry={() => query.refetch()} />}
      {!query.isLoading && notifications.length === 0 && <EmptyState title={t("notif.empty")} icon={<Bell className="h-8 w-8" />} />}

      <ul className="space-y-2">
        {notifications.map((notification) => {
          const href = linkFor(notification);
          const labelKey = `notif.${notification.type}` as TranslationKey;
          const text = t(labelKey, {
            user: notification.actor ? `@${notification.actor.username}` : "UZON",
            preview: notification.preview ?? "",
            type: notification.entityType === "video" ? t("nav.video").toLowerCase() : t("profile.posts").toLowerCase(),
          });
          const content = (
            <div className={`flex items-start gap-3 rounded-2xl border p-3 transition ${notification.read ? "border-line bg-surface" : "border-brand/30 bg-brandsoft/40"}`}>
              <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-surface2">{iconFor(notification.type)}</span>
              {notification.actor && <Avatar name={notification.actor.displayName} url={notification.actor.avatarUrl} size={32} />}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">
                  {text}
                  {notification.groupCount > 1 && <span className="ml-1.5 rounded-full bg-surface2 px-1.5 text-[10px] text-muted">+{notification.groupCount - 1}</span>}
                </p>
                <p className="text-[11px] text-muted">{fmt.relative(notification.createdAt)}</p>
              </div>
              {!notification.read && (
                <IconButton label={t("notif.markAll")} onClick={() => markRead.mutate([notification.id])}>
                  <CheckCheck className="h-4 w-4" />
                </IconButton>
              )}
            </div>
          );
          return (
            <li key={notification.id}>
              {href ? (
                <Link href={href} onClick={() => !notification.read && markRead.mutate([notification.id])}>
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>

      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
            {t("common.seeAll")}
          </Button>
        </div>
      )}
    </div>
  );
}