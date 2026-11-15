"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const CONSENT_KEY = "uzon.analytics-consent";
const VISITOR_KEY = "uzon.analytics-visitor";
const SESSION_KEY = "uzon.analytics-session";

function browserInfo() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Other";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Other";
  const deviceType = /iPad|Tablet/.test(ua) ? "tablet" : /Mobile|Android|iPhone/.test(ua) ? "mobile" : "desktop";
  return { browser, os, deviceType };
}

function getOrCreate(key: string) {
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
}

export function AnalyticsTracker() {
  const pathname = usePathname();
  const [consent, setConsent] = useState<"unknown" | "accepted" | "rejected">("unknown");

  useEffect(() => {
    const saved = localStorage.getItem(CONSENT_KEY);
    if (saved === "accepted" || saved === "rejected") setConsent(saved);
  }, []);

  useEffect(() => {
    if (consent !== "accepted" || !pathname) return;

    const visitorId = getOrCreate(VISITOR_KEY);
    const sessionId = getOrCreate(SESSION_KEY);
    const params = new URLSearchParams(window.location.search);
    const referrer = document.referrer;
    let referrerHost: string | null = null;
    try {
      referrerHost = referrer ? new URL(referrer).hostname : null;
    } catch {
      referrerHost = null;
    }
    const { browser, os, deviceType } = browserInfo();

    void fetch("/api/analytics/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        visitorId,
        sessionId,
        path: pathname,
        referrerHost,
        utmSource: params.get("utm_source"),
        utmMedium: params.get("utm_medium"),
        utmCampaign: params.get("utm_campaign"),
        browser,
        os,
        deviceType,
      }),
    }).catch(() => undefined);
  }, [consent, pathname]);

  const choose = (value: "accepted" | "rejected") => {
    localStorage.setItem(CONSENT_KEY, value);
    setConsent(value);
  };

  if (consent !== "unknown") return null;

  return (
    <aside
      role="dialog"
      aria-label="Настройки аналитики"
      className="fixed inset-x-3 bottom-3 z-[120] mx-auto max-w-xl rounded-2xl border border-[#29466e] bg-[#071326] p-4 text-white shadow-2xl"
    >
      <p className="text-sm font-semibold">Помогите улучшить UZON</p>
      <p className="mt-1 text-xs leading-5 text-[#a9bad3]">
        С вашего разрешения мы будем собирать обезличенную статистику посещений,
        источников переходов и устройств. Мы не записываем IP-адреса, пароли или
        содержимое сообщений. Вы можете отказаться — основные функции сайта останутся доступны.
      </p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => choose("rejected")}
          className="rounded-xl border border-[#29466e] px-4 py-2 text-xs text-[#c2d0e4]"
        >
          Отказаться
        </button>
        <button
          type="button"
          onClick={() => choose("accepted")}
          className="rounded-xl bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-2 text-xs font-semibold text-white"
        >
          Разрешить аналитику
        </button>
      </div>
    </aside>
  );
}
