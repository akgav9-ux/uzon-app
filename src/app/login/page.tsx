"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LogIn, ShieldCheck } from "lucide-react";
import { Suspense, useState } from "react";
import { useApp } from "@/components/providers";
import { UzonMark, UzonWordmark } from "@/components/logo";
import { Button, Card, Field, Input } from "@/components/ui";
import { get, post as postApi } from "@/lib/client/api";
import { LOCALES } from "@/lib/i18n";

type SessionResponse = { user: { username: string } | null };
type ConfigResponse = { demoMode: boolean; demoAccounts: { username: string; password: string; role: string; note: string | null }[] };

function LoginInner() {
  const { t, setUser, refreshUser, toast, locale, setLocale } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/home";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const session = useQuery({ queryKey: ["me"], queryFn: () => get<SessionResponse>("/api/auth") });
  const config = useQuery({ queryKey: ["config"], queryFn: () => get<ConfigResponse>("/api/config") });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await postApi<{ user: never }>("/api/auth", { action: "login", identifier, password });
      void data;
      await refreshUser();
      setUser((await get<SessionResponse>("/api/auth")).user as never);
      toast(t("auth.welcome"), "success");
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="uz-ornament flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <Link href="/" className="flex items-center justify-center gap-2.5">
          <UzonMark size={40} />
          <UzonWordmark withSlogan />
        </Link>

        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h1 className="flex items-center gap-2 text-base font-semibold text-ink">
              <LogIn className="h-4 w-4 text-brand" />
              {t("auth.login")}
            </h1>
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-[11px] text-ink"
              aria-label={t("settings.language")}
            >
              {LOCALES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.short}
                </option>
              ))}
            </select>
          </div>

          <form className="space-y-3" onSubmit={submit}>
            <Field label={`${t("auth.username")} / ${t("auth.email")} / ${t("auth.phone")}`} required>
              <Input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="username"
                required
                invalid={Boolean(error)}
                placeholder="aziza"
              />
            </Field>
            <Field label={t("auth.password")} required error={error}>
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required invalid={Boolean(error)} />
            </Field>
            <Button type="submit" className="w-full" size="lg" loading={busy}>
              {t("auth.login")}
            </Button>
          </form>

          <div className="flex items-center justify-between text-xs">
            <Link href="/recover" className="text-brand hover:underline">
              {t("auth.forgot")}
            </Link>
            <Link href="/register" className="text-muted hover:text-ink">
              {t("auth.noAccount")}
            </Link>
          </div>

          {config.data?.demoMode && config.data.demoAccounts.length > 0 && (
            <div className="rounded-xl border border-line bg-surface2 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                <ShieldCheck className="h-3.5 w-3.5 text-brand" />
                {t("auth.demoAccounts")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {config.data.demoAccounts.map((account) => (
                  <button
                    key={account.username}
                    type="button"
                    onClick={() => {
                      setIdentifier(account.username);
                      setPassword(account.password);
                    }}
                    className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink hover:border-brand"
                  >
                    @{account.username}
                    {account.role !== "user" && <span className="ml-1 text-brand">· {account.role}</span>}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-muted">{t("auth.useAccount")} — {config.data.demoAccounts[0]?.password}</p>
            </div>
          )}
        </Card>

        <p className="text-center text-[11px] text-muted">{t("auth.terms")}</p>
        {session.data?.user && <p className="text-center text-[11px] text-muted">→ /home</p>}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
