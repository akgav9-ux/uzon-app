
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers";
import { UzonMark, UzonWordmark } from "@/components/logo";
import { Button, Card, Field, Input } from "@/components/ui";
import { post as postApi } from "@/lib/client/api";
import { LOCALES } from "@/lib/i18n";

type RegisterResponse = {
  user: { username: string };
  verification: {
    channel: string;
    destination: string;
    delivered: boolean;
    deliveryReason: string | null;
    devCode: string | null;
  };
};

export default function RegisterPage() {
  const { t, locale, setLocale, theme, toast, refreshUser } = useApp();
  const router = useRouter();

  const [step, setStep] = useState<
    "language" | "form" | "verify" | "success"
  >("form");

  const [form, setForm] = useState({
    username: "",
    displayName: "",
    email: "",
    phone: "",
    password: "",
  });

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [verification, setVerification] =
    useState<RegisterResponse["verification"] | null>(null);
  const [code, setCode] = useState("");

  const successText =
    locale === "uz"
      ? {
          title: "Ro‘yxatdan o‘tish muvaffaqiyatli yakunlandi!",
          description: "UZON platformasiga xush kelibsiz! Hisobingiz foydalanishga tayyor.",
          button: "UZON platformasiga o‘tish",
        }
      : locale === "en"
        ? {
            title: "Registration successful!",
            description: "Welcome to UZON! Your account is ready to use.",
            button: "Go to UZON",
          }
        : {
            title: "Регистрация прошла успешно!",
            description: "Добро пожаловать в UZON! Ваш аккаунт готов к использованию.",
            button: "Перейти в UZON",
          };

  useEffect(() => {
    if (step !== "success") return;

    const timer = setTimeout(() => {
      router.replace("/home");
    }, 2500);

    return () => clearTimeout(timer);
  }, [step, router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const data = await postApi<RegisterResponse>("/api/auth", {
        action: "register",
        username: form.username,
        displayName: form.displayName,
        email: form.email || undefined,
        phone: form.phone || undefined,
        phoneCountry: form.phone.startsWith("+998")
          ? "+998"
          : undefined,
        password: form.password,
        locale,
        theme,
        acceptedTerms: true,
        documentVersion: "2026-11-12",
      });

      setVerification(data.verification);
      await refreshUser();

      // SMS delivery is optional until a phone provider is configured.
      // If phone registration succeeded but SMS was not delivered, enter the app directly.
      if (data.verification.channel === "phone" && !data.verification.delivered) {
        toast(t("auth.welcome"), "success");
        router.replace("/home");
        return;
      }

      setStep("verify");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("common.error"),
      );
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);

    try {
      await postApi("/api/auth", {
        action: "verify",
        code,
      });

      await refreshUser();
      setStep("success");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("common.error"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="uz-ornament flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <Link
          href="/"
          className="flex items-center justify-center gap-2.5"
        >
          <UzonMark size={40} />
          <UzonWordmark withSlogan />
        </Link>

        <Card className="space-y-4 p-5">
          {step === "language" && (
            <>
              <h1 className="text-base font-semibold text-ink">
                {t("auth.chooseLanguage")}
              </h1>

              <div className="grid gap-2">
                {LOCALES.map((item) => (
                  <button
                    key={item.code}
                    onClick={() => setLocale(item.code)}
                    className={`flex items-center justify-between rounded-xl border px-3.5 py-3 text-sm transition ${
                      locale === item.code
                        ? "border-brand bg-brandsoft text-brand"
                        : "border-line text-ink hover:border-brand/50"
                    }`}
                  >
                    <span className="font-medium">{item.label}</span>
                    <span className="text-[11px] opacity-70">
                      {item.short}
                    </span>
                  </button>
                ))}
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={() => setStep("form")}
              >
                {t("auth.continue")}
              </Button>

              <p className="text-center text-[11px] text-muted">
                {t("auth.welcome")}
              </p>
            </>
          )}

          {step === "form" && (
            <>
              <div className="flex items-center justify-between">
                <h1 className="flex items-center gap-2 text-base font-semibold text-ink">
                  <UserPlus className="h-4 w-4 text-brand" />
                  {t("auth.register")}
                </h1>

                <select
                  aria-label={t("auth.chooseLanguage")}
                  value={locale}
                  onChange={(event) => setLocale(event.target.value)}
                  className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink"
                >
                  {LOCALES.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <form className="space-y-3" onSubmit={submit}>
                <Field
                  label={t("auth.username")}
                  required
                  hint={locale === "uz" ? "Lotin harflari, raqamlar, _ yoki . (3–30)" : locale === "en" ? "Letters, numbers, _ or . (3–30)" : "Латинские буквы, цифры, _ или . (3–30)"}
                >
                  <Input
                    value={form.username}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        username: event.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_.]/g, ""),
                      })
                    }
                    required
                    minLength={3}
                    maxLength={30}
                    autoComplete="username"
                  />
                </Field>

                <Field
                  label={t("auth.displayName")}
                  required
                >
                  <Input
                    value={form.displayName}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        displayName: event.target.value,
                      })
                    }
                    required
                    minLength={2}
                    maxLength={60}
                    autoComplete="name"
                  />
                </Field>

                <Field
                  label={t("auth.email")}
                  hint={
                    locale === "uz"
                      ? "Email yoki telefon raqamidan birini kiriting"
                      : locale === "en"
                        ? "Enter either an email address or a phone number"
                        : "Укажите email или номер телефона"
                  }
                >
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        email: event.target.value,
                      })
                    }
                    autoComplete="email"
                  />
                </Field>

                <Field
                  label={t("auth.phone")}
                  hint={t("auth.phoneHint")}
                >
                  <Input
                    value={form.phone}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        phone: event.target.value,
                      })
                    }
                    placeholder="+998901234567"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </Field>

                <Field
                  label={t("auth.password")}
                  required
                  hint={locale === "uz" ? "Kamida 8 ta belgi" : locale === "en" ? "At least 8 characters" : "Не менее 8 символов"}
                >
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        password: event.target.value,
                      })
                    }
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </Field>

                <div className="space-y-1.5">
                  <label className="flex items-start gap-2 text-xs text-ink">
                    <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required className="mt-0.5 h-4 w-4 accent-brand" />
                    <span>{locale === "uz" ? "Tasdiqlayman" : locale === "en" ? "I confirm" : "Подтверждаю"}</span>
                  </label>
                  <p className="pl-6 text-[11px] text-muted">
                    <Link href="/terms" className="text-brand hover:underline">{locale === "uz" ? "Foydalanish shartlari" : locale === "en" ? "Terms of Service" : "Пользовательское соглашение"}</Link>
                    {" · "}
                    <Link href="/privacy" className="text-brand hover:underline">{locale === "uz" ? "Maxfiylik siyosati" : locale === "en" ? "Privacy Policy" : "Политика конфиденциальности"}</Link>
                    {" · "}
                    <Link href="/community-guidelines" className="text-brand hover:underline">{locale === "uz" ? "Hamjamiyat qoidalari" : locale === "en" ? "Community Rules" : "Правила сообщества"}</Link>
                  </p>
                </div>

                {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">{error}</p>}

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  loading={busy}
                  disabled={!acceptedTerms}
                >
                  {t("auth.register")}
                </Button>
              </form>

              <div className="relative my-2 flex items-center justify-center">
                <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
                <span className="relative bg-surface px-2 text-xs text-muted">
                  {locale === "uz" ? "yoki" : locale === "en" ? "or" : "или"}
                </span>
              </div>

              <a
                href={"/api/auth/google?accept=" + (acceptedTerms ? "1" : "0") + "&locale=" + encodeURIComponent(locale)}
                className={"flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface py-2.5 text-sm font-medium text-ink transition hover:bg-surface2 " + (acceptedTerms ? "" : "pointer-events-none opacity-50")} aria-disabled={!acceptedTerms} tabIndex={acceptedTerms ? 0 : -1}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                {locale === "uz" ? "Google orqali davom etish" : locale === "en" ? "Continue with Google" : "Продолжить с Google"}
              </a>

              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-muted">{t("auth.welcome")}</span>

                <Link
                  href="/login"
                  className="text-brand hover:underline"
                >
                  {t("auth.haveAccount")}
                </Link>
              </div>

            </>
          )}

          {step === "verify" && verification && (
            <>
              <h1 className="text-base font-semibold text-ink">
                {t("auth.register")}
              </h1>

              <p className="text-xs text-muted">
                {t("auth.recoverSent")} {verification.channel}:{" "}
                <b className="text-ink">
                  {verification.destination}
                </b>
              </p>

              {!verification.delivered && (
                <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-[11px] text-warning">
                  <p>{t("auth.recoverDev")}</p>
                  <p className="mt-1 opacity-80">
                    {verification.deliveryReason}
                  </p>

                  {verification.devCode && (
                    <p className="mt-1 text-sm font-bold">
                      {verification.devCode}
                    </p>
                  )}
                </div>
              )}

              <Field label={t("auth.recoverToken")}>
                <Input
                  value={code}
                  onChange={(event) =>
                    setCode(
                      event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 6),
                    )
                  }
                  inputMode="numeric"
                  placeholder="000000"
                />
              </Field>

              {error && (
                <p className="text-xs text-danger">{error}</p>
              )}

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={verify}
                  loading={busy}
                  disabled={code.length !== 6}
                >
                  {t("common.confirm")}
                </Button>

                <Button
                  variant="secondary"
                  onClick={() =>
                    postApi("/api/auth", { action: "resend" })
                      .then(() =>
                        toast(t("auth.recoverSent"), "success"),
                      )
                      .catch((err) =>
                        setError(
                          err instanceof Error
                            ? err.message
                            : t("common.error"),
                        ),
                      )
                  }
                >
                  {t("common.retry")}
                </Button>

                <Button
                  variant="ghost"
                  onClick={() => router.replace("/home")}
                >
                  {t("common.next")}
                </Button>
              </div>
            </>
          )}

          {step === "success" && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10">
                <CheckCircle2 className="h-14 w-14 text-green-500" />
              </div>

              <h1 className="text-xl font-bold text-ink">
                {successText.title}
              </h1>

              <p className="text-sm text-muted">
                {successText.description}
              </p>

              <Button
                className="w-full"
                size="lg"
                onClick={() => router.replace("/home")}
              >
                {successText.button}
              </Button>

              <p className="text-[11px] text-muted">
                UZON
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
