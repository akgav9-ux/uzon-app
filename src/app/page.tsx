"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, MessageCircle, PlaySquare, Sparkles, ShieldCheck, Globe2 } from "lucide-react";
import { useApp } from "@/components/providers";
import { UzonMark, UzonWordmark } from "@/components/logo";
import { Badge, Button, Card } from "@/components/ui";
import { get } from "@/lib/client/api";
import { LOCALES } from "@/lib/i18n";

type ConfigResponse = {
  demoMode: boolean;
  integrations: Record<string, boolean | string>;
  features: Record<string, boolean>;
};

export default function LandingPage() {
  const { t, user, authLoading, locale, setLocale } = useApp();
  const router = useRouter();
  const config = useQuery({ queryKey: ["config"], queryFn: () => get<ConfigResponse>("/api/config") });

  useEffect(() => {
    if (!authLoading && user) router.replace("/home");
  }, [authLoading, user, router]);

  const features = [
    { icon: <MessageCircle className="h-5 w-5" />, label: t("landing.feature1"), ready: config.data?.features.messenger },
    { icon: <Clapperboard className="h-5 w-5" />, label: t("landing.feature2"), ready: config.data?.features.clips },
    { icon: <PlaySquare className="h-5 w-5" />, label: t("landing.feature3"), ready: config.data?.features.longVideos },
    { icon: <Sparkles className="h-5 w-5" />, label: t("landing.feature4"), ready: config.data?.features.creatorStudio },
  ];

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="uz-ornament">
        <div className="mx-auto flex max-w-5xl flex-col gap-8 px-5 py-8 md:py-14">
          <header className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <UzonMark size={38} />
              <UzonWordmark withSlogan />
            </div>
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="landing-locale">{t("settings.language")}</label>
              <select
                id="landing-locale"
                value={locale}
                onChange={(event) => setLocale(event.target.value)}
                className="h-9 rounded-lg border border-line bg-surface px-2 text-xs text-ink"
              >
                {LOCALES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
              <Link href="/login">
                <Button size="sm" variant="secondary">{t("auth.login")}</Button>
              </Link>
            </div>
          </header>

          <section className="grid items-center gap-8 md:grid-cols-2">
            <div className="space-y-4">
              <Badge tone="brand">
                <Globe2 className="h-3 w-3" /> {t("landing.madeIn")}
              </Badge>
              <h1 className="text-3xl font-bold leading-tight text-ink md:text-5xl">{t("landing.hero")}</h1>
              <p className="text-sm text-muted md:text-base">{t("app.tagline")}</p>
              <p className="text-xs italic text-brand">{t("app.slogan")}</p>
              <div className="flex flex-wrap gap-2">
                <Link href="/register">
                  <Button size="lg">{t("landing.cta")}</Button>
                </Link>
                <Link href="/videos">
                  <Button size="lg" variant="secondary">{t("landing.cta2")}</Button>
                </Link>
              </div>
            </div>

            <Card className="uz-pattern space-y-3 p-5">
              <div className="flex items-center gap-2 text-xs text-muted">
                <ShieldCheck className="h-4 w-4 text-brand" />
                {t("settings.security")}
              </div>
              <ul className="space-y-2 text-sm">
                {[
                  ["messenger", t("landing.feature1")],
                  ["clips", t("landing.feature2")],
                  ["longVideos", t("landing.feature3")],
                  ["creatorStudio", t("landing.feature4")],
                  ["calls", t("nav.calls")],
                  ["moderation", t("admin.title")],
                  ["pushNotifications", t("notif.title")],
                  ["videoTranscoding", t("video.processing")],
                  ["monetization", t("studio.analytics")],
                ].map(([key, label]) => (
                  <li key={key} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2">
                    <span className="truncate text-xs text-ink">{label}</span>
                    <Badge tone={config.data?.features[key] ? "success" : "warning"}>
                      {config.data?.features[key] ? "✓" : t("common.soon")}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <Card key={feature.label} className="p-4">
                <span className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brandsoft text-brand">{feature.icon}</span>
                <p className="text-sm font-semibold text-ink">{feature.label}</p>
                <p className="mt-1 text-[11px] text-muted">{feature.ready ? "✓ UZON API" : t("common.soon")}</p>
              </Card>
            ))}
          </section>

          <footer className="space-y-1 border-t border-line pt-5 text-[11px] text-muted">
            <p>
              {t("app.name")} · {t("app.slogan")}
            </p>
            <p>
              {t("settings.about")}: {config.data?.integrations.objectStorage === "local" ? "local media storage" : String(config.data?.integrations.objectStorage ?? "")} ·
              {" "}email: {config.data?.integrations.emailDelivery ? "✓" : "✗"} · sms: {config.data?.integrations.smsDelivery ? "✓" : "✗"} ·
              {" "}TURN: {config.data?.integrations.turnServer ? "✓" : "✗"}
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
