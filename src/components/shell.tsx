
"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ShareUzonButton } from "@/components/share-uzon-button";
import {
  Bell,
  Bookmark,
  Clapperboard,
  Compass,
  Home,
  LogOut,
  MessageCircle,
  PlaySquare,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  User as UserIcon,
  Video,
  Phone,
  Users,
  Menu,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useApp } from "@/components/providers";
import { UzonMark, UzonWordmark } from "@/components/logo";
import { Avatar, Badge, Input, Spinner } from "@/components/ui";
import { get, qk } from "@/lib/client/api";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  icon: ReactNode;
  labelKey: Parameters<ReturnType<typeof useApp>["t"]>[0];
  badge?: number;
};

export function useUnread() {
  const { user } = useApp();

  const notifications = useQuery({
    queryKey: qk.notifications,
    queryFn: () => get<{ unread: number }>("/api/notifications"),
    enabled: Boolean(user),
    refetchInterval: 20_000,
  });

  const conversations = useQuery({
    queryKey: qk.conversations,
    queryFn: () =>
      get<{ conversations: { unread: number }[] }>("/api/conversations"),
    enabled: Boolean(user),
    refetchInterval: 15_000,
  });

  return {
    notifications: notifications.data?.unread ?? 0,
    messages: (conversations.data?.conversations ?? []).reduce(
      (sum, conversation) => sum + conversation.unread,
      0,
    ),
  };
}

export function AppShell({ children }: { children: ReactNode }) {
  const {
    user,
    t,
    authLoading,
    locale,
    setLocale,
    theme,
    setTheme,
    refreshUser,
  } = useApp();

  const pathname = usePathname();
  const router = useRouter();
  const unread = useUnread();
  const searchParams = useSearchParams();

  const isClipsPage = pathname === "/clips";
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (isClipsPage) {
      setMobileMenuOpen(false);
    }
  }, [isClipsPage]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });

      await refreshUser();
      router.push("/login");
      router.refresh();
    } catch (error) {
      console.error("Ошибка выхода:", error);
    }
  };

  // После успешной авторизации обновляем пользователя и открываем главную.
  useEffect(() => {
    if (searchParams.get("auth") === "success") {
      void refreshUser().then(() => {
        router.replace("/home");
      });
    }
  }, [searchParams, refreshUser, router]);

  // Публичные страницы доступны без входа.
  const publicPaths = [
    "/",
    "/home",
    "/clips",
    "/videos",
    "/search",
    "/u/",
    "/c/",
    "/post/",
  ];

  const isPublicPage = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(path),
  );

  useEffect(() => {
    if (!authLoading && !user && !isPublicPage) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [authLoading, user, pathname, router, isPublicPage]);

  if (authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center gap-3">
        <Spinner />
        <span className="text-sm text-muted">{t("common.loading")}</span>
      </div>
    );
  }

  // Если гость открыл закрытую страницу, ждём перехода на вход.
  if (!user && !isPublicPage) return null;

  const primary: NavItem[] = [
    {
      href: "/home",
      icon: <Home className="h-5 w-5" />,
      labelKey: "nav.home",
    },
    {
      href: "/clips",
      icon: <Clapperboard className="h-5 w-5" />,
      labelKey: "nav.clips",
    },
    {
      href: "/create",
      icon: <Plus className="h-5 w-5" />,
      labelKey: "nav.create",
    },
    {
      href: "/messages",
      icon: <MessageCircle className="h-5 w-5" />,
      labelKey: "nav.messages",
      badge: unread.messages,
    },
    {
      href: "/profile",
      icon: <UserIcon className="h-5 w-5" />,
      labelKey: "nav.profile",
    },
  ];

  const secondary: NavItem[] = [
    {
      href: "/videos",
      icon: <PlaySquare className="h-5 w-5" />,
      labelKey: "nav.video",
    },
    {
      href: "/search",
      icon: <Search className="h-5 w-5" />,
      labelKey: "nav.search",
    },
    {
      href: "/notifications",
      icon: <Bell className="h-5 w-5" />,
      labelKey: "nav.notifications",
      badge: unread.notifications,
    },
    {
      href: "/saved",
      icon: <Bookmark className="h-5 w-5" />,
      labelKey: "nav.saved",
    },
    {
      href: "/calls",
      icon: <Phone className="h-5 w-5" />,
      labelKey: "nav.calls",
    },
    {
      href: "/contacts",
      icon: <Users className="h-5 w-5" />,
      labelKey: "nav.contacts",
    },
    {
      href: "/studio",
      icon: <Sparkles className="h-5 w-5" />,
      labelKey: "nav.studio",
    },
    {
      href: "/settings",
      icon: <Settings className="h-5 w-5" />,
      labelKey: "nav.settings",
    },
  ];

  const staff: NavItem[] = [
    {
      href: "/admin",
      icon: <ShieldAlert className="h-5 w-5" />,
      labelKey: "nav.admin",
    },
  ];

  const all = [
    ...primary,
    ...secondary,
    ...(user && (user.role === "admin" || user.role === "moderator")
      ? staff
      : []),
  ];

  const isChatOpen =
    pathname === "/messages" && Boolean(searchParams.get("id"));

  return (
    <div className="min-h-dvh bg-canvas">
      {/* Боковое меню на компьютерах. На странице клипов скрыто. */}
      {!isClipsPage && (
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-surface/60 px-3 py-4 md:flex lg:w-64">
          <Link
            href="/home"
            className="mb-5 flex items-center gap-2.5 px-2"
          >
            <UzonMark size={34} />
            <UzonWordmark />
          </Link>

          <nav
            className="flex flex-1 flex-col gap-0.5 overflow-y-auto"
            aria-label={t("nav.home")}
          >
            {all.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  isActive(item.href)
                    ? "bg-brandsoft text-brand"
                    : "text-muted hover:bg-surface2 hover:text-ink",
                )}
              >
                {item.icon}
                <span className="flex-1 truncate">
                  {t(item.labelKey)}
                </span>

                {Boolean(item.badge) && (
                  <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          {user && (
            <div className="mt-3 px-1">
              <ShareUzonButton />
            </div>
          )}

          <div className="mt-3 flex flex-col gap-1">
            {user ? (
              <>
                <Link
                  href={`/u/${user.username}`}
                  className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-2.5 py-2 transition hover:border-brand/40"
                >
                  <Avatar
                    name={user.displayName}
                    url={user.avatarUrl}
                    size={34}
                  />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-ink">
                      {user.displayName}
                    </span>
                    <span className="block truncate text-[11px] text-muted">
                      @{user.username}
                    </span>
                  </span>
                </Link>

                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-muted transition hover:bg-danger/10 hover:text-danger"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Выйти</span>
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="flex items-center justify-center gap-2 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand/90"
              >
                Войти
              </Link>
            )}
          </div>
        </aside>
      )}

      {/* Верхняя панель. На странице клипов скрыта. */}
      {!isClipsPage && (
        <header className="sticky top-0 z-30 border-b border-line bg-surface/80 backdrop-blur-xl md:pl-60 lg:pl-64">
          <div className="safe-top flex h-14 items-center gap-2 px-3 md:px-6">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface2 md:hidden"
              aria-label="Открыть меню"
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link
              href="/home"
              className="flex items-center gap-2 md:hidden"
            >
              <UzonMark size={32} />
              <span className="text-[16px] font-extrabold tracking-[0.1em] text-ink">
                UZON
              </span>
            </Link>

            <form
              className="hidden flex-1 md:block"
              onSubmit={(event) => {
                event.preventDefault();
                const value = new FormData(event.currentTarget).get("q");

                if (value) {
                  router.push(
                    `/search?q=${encodeURIComponent(String(value))}`,
                  );
                }
              }}
            >
              <div className="relative max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  name="q"
                  placeholder={t("search.placeholder")}
                  className="h-10 rounded-full border-0 bg-surface2 pl-9 pr-4 text-sm placeholder:text-muted focus:ring-2 focus:ring-brand/30"
                  aria-label={t("search.placeholder")}
                />
              </div>
            </form>

            <div className="ml-auto flex items-center gap-1 text-ink">
              {user ? (
                <>
                  <Link
                    href="/notifications"
                    aria-label={t("nav.notifications")}
                    className="relative"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface2">
                      <Bell className="h-5 w-5" />
                    </span>

                    {unread.notifications > 0 && (
                      <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white">
                        {unread.notifications > 9
                          ? "9+"
                          : unread.notifications}
                      </span>
                    )}
                  </Link>

                  <button
                    onClick={() =>
                      setTheme(theme === "dark" ? "light" : "dark")
                    }
                    className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-surface2"
                    aria-label={
                      theme === "dark"
                        ? t("settings.themeLight")
                        : t("settings.themeDark")
                    }
                  >
                    {theme === "dark" ? (
                      <Compass className="h-5 w-5" />
                    ) : (
                      <Video className="h-5 w-5" />
                    )}
                  </button>

                  <div className="hidden items-center md:flex">
                    <select
                      id="lang-select"
                      value={locale}
                      onChange={(event) => setLocale(event.target.value)}
                      className="h-10 rounded-full border-0 bg-surface2 px-3 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
                    >
                      <option value="ru">RU</option>
                      <option value="en">EN</option>
                      <option value="uz-Latn">UZ</option>
                    </select>
                  </div>

                  <Link
                    href={`/u/${user.username}`}
                    className="ml-1 hidden md:block"
                  >
                    <Avatar
                      name={user.displayName}
                      url={user.avatarUrl}
                      size={36}
                      className="ring-2 ring-surface"
                    />
                  </Link>

                  <button
                    onClick={handleLogout}
                    className="hidden h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-danger/10 hover:text-danger md:flex"
                    aria-label="Выйти"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
                >
                  Войти
                </Link>
              )}
            </div>
          </div>

          <OfflineBar />
        </header>
      )}

      {/* Мобильное меню. На странице клипов не отображается. */}
      {!isClipsPage && mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex h-[100dvh] w-full flex-col bg-background">
          <div
            className="absolute left-0 top-0 flex h-full w-72 flex-col overflow-y-auto bg-surface p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <Link
                href="/home"
                className="flex items-center gap-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                <UzonMark size={32} />
                <UzonWordmark />
              </Link>

              <button
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-full p-2 text-muted hover:bg-surface2"
                aria-label="Закрыть меню"
              >
                ✕
              </button>
            </div>

            <nav className="flex flex-col gap-1">
              {all.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                    isActive(item.href)
                      ? "bg-brandsoft text-brand"
                      : "text-muted hover:bg-surface2 hover:text-ink",
                  )}
                >
                  {item.icon}
                  <span>{t(item.labelKey)}</span>

                  {Boolean(item.badge) && (
                    <span className="ml-auto rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              ))}
            </nav>

            {user && (
              <div className="mt-3">
                <ShareUzonButton />
              </div>
            )}

            <div className="mt-auto pt-4">
              {user ? (
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-danger hover:bg-danger/10"
                >
                  <LogOut className="h-4 w-4" />
                  Выйти
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex w-full items-center justify-center gap-3 rounded-xl bg-brand px-3 py-2.5 text-sm font-medium text-white"
                >
                  Войти
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* На клипах убираем отступы и занимаем весь экран. */}
      <main className={isClipsPage ? "" : "md:pl-60 lg:pl-64"}>
        <div
          className={
            isClipsPage
              ? "w-full"
              : "mx-auto w-full max-w-6xl px-3 pb-24 pt-4 md:px-6 md:pb-10"
          }
        >
          {children}
        </div>
      </main>

      {/* Нижняя навигация скрыта в открытом чате и на клипах. */}
      {!isChatOpen && !isClipsPage && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-line bg-surface/90 backdrop-blur-xl md:hidden"
          aria-label={t("nav.home")}
        >
          {primary.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition",
                isActive(item.href) ? "text-brand" : "text-muted",
              )}
            >
              {item.icon}
              <span>{t(item.labelKey)}</span>

              {Boolean(item.badge) && (
                <span className="absolute right-[22%] top-1 h-2 w-2 rounded-full bg-danger" />
              )}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

function OfflineBar() {
  const { t, online } = useApp();

  if (online) return null;

  return (
    <div className="bg-warning/20 px-4 py-1.5 text-center text-[11px] font-medium text-warning">
      {t("common.offline")}
    </div>
  );
}

export function SectionHeader({
  title,
  action,
  subtitle,
}: {
  title: string;
  action?: ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-ink md:text-lg">
          {title}
        </h2>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === "ready"
      ? "success"
      : status === "processing"
        ? "warning"
        : "danger";

  return <Badge tone={tone as "success"}>{status}</Badge>;
}
