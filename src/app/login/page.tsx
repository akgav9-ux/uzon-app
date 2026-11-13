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
type PendingVerification = { channel: string; destination: string; delivered: boolean; deliveryReason: string | null; devCode: string | null };

function LoginInner() {
  const { t, setUser, refreshUser, toast, locale, setLocale } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/home";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verification, setVerification] = useState<PendingVerification | null>(null);
  const [code, setCode] = useState("");

  const session = useQuery({ queryKey: ["me"], queryFn: () => get<SessionResponse>("/api/auth") });
  const config = useQuery({ queryKey: ["config"], queryFn: () => get<ConfigResponse>("/api/config") });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await postApi<{ verificationRequired?: boolean; verification?: PendingVerification }>("/api/auth", { action: "login", identifier, password });
      if (data.verificationRequired && data.verification) {
        setVerification(data.verification);
        return;
      }
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

  const confirmEmail = async () => {
    setBusy(true);
    setError(null);
    try {
      await postApi("/api/auth", { action: "verify", code });
      await refreshUser();
      const current = await get<SessionResponse>("/api/auth");
      if (!current.user) throw new Error("Email verification did not complete. Please try again.");
      setUser(current.user as never);
      toast(t("auth.welcome"), "success");
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const resendEmailCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await postApi<{ delivered: boolean; reason: string | null; devCode: string | null }>("/api/auth", {
        action: "resend",
        channel: "email",
      });
      setVerification((current) => current ? {
        ...current,
        delivered: result.delivered,
        deliveryReason: result.reason,
        devCode: result.devCode,
      } : current);
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

          {!verification && <form className="space-y-3" onSubmit={submit}>
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
          </form>}

          {!verification && (
            <>
              <div className="relative flex items-center justify-center py-1">
                <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
                <span className="relative bg-surface px-2 text-xs text-muted">
                  {locale === "uz" ? "yoki" : locale === "en" ? "or" : "или"}
                </span>
              </div>
              <a
                href="/api/auth/google"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface py-3 text-sm font-medium text-ink transition hover:bg-surface2"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {locale === "uz" ? "Google orqali davom etish" : locale === "en" ? "Continue with Google" : "Продолжить с Google"}
              </a>
            </>
          )}

          {verification && (
            <div className="space-y-3">
              <p className="text-sm text-ink">
                {t("auth.recoverSent")} email: <b>{verification.destination}</b>
              </p>
              {!verification.delivered && (
                <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                  <p>{t("auth.recoverDev")}</p>
                  {verification.deliveryReason && <p className="mt-1">{verification.deliveryReason}</p>}
                  {verification.devCode && <p className="mt-1 font-bold">{verification.devCode}</p>}
                </div>
              )}
              <Field label={t("auth.recoverToken")}>
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  placeholder="000000"
                />
              </Field>
              {error && <p role="alert" className="text-xs text-danger">{error}</p>}
              <Button className="w-full" onClick={confirmEmail} loading={busy} disabled={code.length !== 6}>
                {t("common.confirm")}
              </Button>
              <Button className="w-full" variant="secondary" onClick={resendEmailCode} loading={busy}>
                {locale === "uz" ? "Kodni qayta yuborish" : locale === "en" ? "Resend code" : "Отправить код повторно"}
              </Button>
            </div>
          )}

          {!verification && <div className="flex items-center justify-between text-xs">
            <Link href="/recover" className="text-brand hover:underline">
              {t("auth.forgot")}
            </Link>
            <Link href="/register" className="text-muted hover:text-ink">
              {t("auth.noAccount")}
            </Link>
          </div>}

          {!verification && config.data?.demoMode && config.data.demoAccounts.length > 0 && (
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
