
"use client";

import { useState } from "react";
import { Check, Copy, Share2, X } from "lucide-react";
import { useApp } from "@/components/providers";

export function ShareUzonButton() {
  const { toast } = useApp();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const getShareData = () => {
    const url = window.location.origin;
    const message =
      "Присоединяйся к UZON — общайся, смотри видео и публикуй контент!";
    return { url, message };
  };

  const copyLink = async () => {
    const { url } = getShareData();

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast("Ссылка на UZON скопирована", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Не удалось скопировать ссылку. Попробуй поделиться через другое приложение.", "error");
    }
  };

  const shareTelegram = () => {
    const { url, message } = getShareData();
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const shareWhatsApp = () => {
    const { url, message } = getShareData();
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${message} ${url}`)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const shareNative = async () => {
    const { url, message } = getShareData();

    if (!navigator.share) {
      await copyLink();
      toast("Системное меню недоступно в этом браузере. Ссылка скопирована, если браузер разрешил копирование.", "success");
      return;
    }

    try {
      await navigator.share({ title: "UZON", text: message, url });
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        toast("Не удалось открыть меню отправки", "error");
      }
    }
  };

  const options = [
    {
      label: "Копировать ссылку",
      icon: copied ? Check : Copy,
      action: copyLink,
    },
    { label: "Telegram", icon: Share2, action: shareTelegram },
    { label: "WhatsApp", icon: Share2, action: shareWhatsApp },
    { label: "Поделиться через телефон", icon: Share2, action: shareNative },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface2"
        aria-expanded={open}
      >
        <Share2 className="h-4 w-4" />
        Поделиться UZON
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Закрыть меню"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />

          <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-line bg-surface p-2 shadow-xl">
            <div className="flex items-center justify-between px-2 py-2">
              <span className="text-sm font-semibold text-ink">
                Поделиться UZON
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
                className="rounded-lg p-1 text-muted hover:bg-surface2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {options.map(({ label, icon: Icon, action }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  void action();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ink hover:bg-surface2"
              >
                <Icon className="h-4 w-4 text-muted" />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
