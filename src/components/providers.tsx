"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { dictionaryFor, detectBrowserLocale, translate, type TranslationKey } from "@/lib/i18n";
import { formatBytes, formatDate, formatDuration, formatNumber, formatRelative, formatTime } from "@/lib/utils";

export type Theme = "dark" | "light" | "system";

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  avatarKey: string | null;
  avatarUrl: string | null;
  coverKey: string | null;
  bio: string | null;
  links: { label: string; url: string }[];
  role: string;
  isCreator: boolean;
  showJoinedDate: boolean;
  followersCount: number;
  followingCount: number;
  createdAt: string;
  theme: Theme;
  locale: string;
  autoplay: boolean;
  dataSaver: boolean;
  notifications: Record<string, boolean>;
  privacy: Record<string, string>;
};

type Toast = { id: string; text: string; tone: "info" | "success" | "error" };

type Ctx = {
  user: SessionUser | null;
  setUser: (user: SessionUser | null) => void;
  authLoading: boolean;
  refreshUser: () => Promise<void>;
  locale: string;
  setLocale: (locale: string) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  fmt: {
    number: (n: number) => string;
    date: (d: string | Date, opts?: Intl.DateTimeFormatOptions) => string;
    time: (d: string | Date) => string;
    relative: (d: string | Date) => string;
    duration: (ms?: number | null) => string;
    bytes: (b: number) => string;
  };
  toast: (text: string, tone?: Toast["tone"]) => void;
  toasts: Toast[];
  online: boolean;
  queryClient: QueryClient;
};

const AppCtx = createContext<Ctx | null>(null);

const THEME_KEY = "uzon.theme";
const LOCALE_KEY = "uzon.locale";

export function AppProviders({ children }: { children: ReactNode }) {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: 0 },
        },
      }),
    [],
  );

  const [user, setUser] = useState<SessionUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [theme, setThemeState] = useState<Theme>("dark");
  const [locale, setLocaleState] = useState<string>("ru");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [online, setOnline] = useState(true);

  // Сохраняем локальные настройки при смене
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_KEY, newTheme);
  }, []);

  const setLocale = useCallback((newLocale: string) => {
    setLocaleState(newLocale);
    localStorage.setItem(LOCALE_KEY, newLocale);
    // Обновляем на сервере (если авторизован)
    fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "settings", locale: newLocale }),
    }).catch(() => undefined);
  }, []);

  const loadSession = useCallback(async () => {
    setAuthLoading(true);
    try {
      const res = await fetch("/api/auth", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { user: SessionUser | null };
        setUser(data.user);
        if (data.user) {
          // Приоритет: localStorage > база > дефолт
          const storedLocale = localStorage.getItem(LOCALE_KEY);
          const storedTheme = localStorage.getItem(THEME_KEY) as Theme | null;

          if (storedLocale) {
            setLocaleState(storedLocale);
          } else {
            setLocaleState(data.user.locale ?? "ru");
          }

          if (storedTheme) {
            setThemeState(storedTheme);
          } else {
            setThemeState((data.user.theme as Theme) ?? "system");
          }
          return;
        }
      }
      setUser(null);
    } catch {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  // Начальная инициализация (до загрузки сессии)
  useEffect(() => {
    const storedTheme = localStorage.getItem(THEME_KEY) as Theme | null;
    const storedLocale = localStorage.getItem(LOCALE_KEY);
    if (!storedLocale) {
      const detected = detectBrowserLocale();
      localStorage.setItem(LOCALE_KEY, detected);
      setLocaleState(detected);
    } else {
      setLocaleState(storedLocale);
    }
    if (storedTheme) setThemeState(storedTheme);
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const toast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3600);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      user,
      setUser,
      authLoading,
      refreshUser: loadSession,
      locale,
      setLocale,
      theme,
      setTheme,
      t: (key, vars) => translate(locale, key, vars),
      fmt: {
        number: (n) => formatNumber(n, locale),
        date: (d, opts) => formatDate(d, locale, opts),
        time: (d) => formatTime(d, locale),
        relative: (d) => formatRelative(d, locale),
        duration: (ms) => formatDuration(ms),
        bytes: (b) => formatBytes(b, locale),
      },
      toast,
      toasts,
      online,
      queryClient,
    }),
    [user, authLoading, loadSession, locale, theme, toast, toasts, online, queryClient, setLocale, setTheme],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppCtx.Provider value={value}>
        {children}
        <ToastHost />
      </AppCtx.Provider>
    </QueryClientProvider>
  );
}

function ToastHost() {
  const { toasts } = useApp();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-8">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`animate-fade-up pointer-events-auto max-w-md rounded-xl border px-4 py-2.5 text-sm shadow-lg ${
            t.tone === "error"
              ? "border-danger/40 bg-danger/15 text-danger"
              : t.tone === "success"
                ? "border-success/40 bg-success/15 text-success"
                : "border-line bg-surface text-ink"
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside AppProviders");
  return ctx;
}

export function useDictionary() {
  const { locale } = useApp();
  return dictionaryFor(locale);
}