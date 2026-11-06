
"use client";

import { useState } from "react";
import { Check, Copy, Share2, X } from "lucide-react";
import { useApp } from "@/components/providers";

export function ShareUzonButton() {
  const { toast, locale } = useApp();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const translations = {
    ru: {
      button: "Поделиться UZON",
      title: "Поделиться UZON",
      copy: "Копировать ссылку",
      copied: "Ссылка скопирована",
      telegram: "Telegram",
      whatsapp: "WhatsApp",
      native: "Поделиться через телефон",
      message: "Присоединяйся к UZON — общайся, смотри видео и публикуй контент!",
      success: "Ссылка на UZON скопирована",
      copyError: "Не удалось скопировать ссылку. Попробуй другой способ отправки.",
      shareError: "Не удалось открыть меню отправки",
      close: "Закрыть",
    },
    en: {
      button: "Share UZON",
      title: "Share UZON",
      copy: "Copy link",
      copied: "Link copied",
      telegram: "Telegram",
      whatsapp: "WhatsApp",
      native: "Share via phone",
      message: "Join UZON — chat, watch videos and share your content!",
      success: "UZON link copied",
      copyError: "Couldn't copy the link. Try another sharing method.",
      shareError: "Couldn't open the sharing menu",
      close: "Close",
    },
    "uz-Latn": {
      button: "UZON'ni ulashish",
      title: "UZON'ni ulashish",
      copy: "Havolani nusxalash",
      copied: "Havola nusxalandi",
      telegram: "Telegram",
      whatsapp: "WhatsApp",
      native: "Telefon orqali ulashish",
      message: "UZON'ga qo'shiling — suhbatlashing, videolar tomosha qiling va kontent ulashing!",
      success: "UZON havolasi nusxalandi",
      copyError: "Havolani nusxalab bo'lmadi. Boshqa usulni sinab ko'ring.",
      shareError: "Ulashish menyusini ochib bo'lmadi",
      close: "Yopish",
    },
  };

  const language =
    locale === "en" ? "en" : locale === "uz-Latn" ? "uz-Latn" : "ru";

  const t = translations[language];

  const getShareData = () => {
    const url = window.location.origin;
    return { url, message: t.message };
  };

  const copyLink = async () => {
    const { url } = getShareData();

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();

        const success = document.execCommand("copy");
        textarea.remove();

        if (!success) throw new Error("Copy failed");
      }

      setCopied(true);
      toast(t.success, "success");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast(t.copyError, "error");
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
      return;
    }

    try {
      await navigator.share({
        title: "UZON",
        text: message,
        url,
      });
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        toast(t.shareError, "error");
      }
    }
  };

  const options = [
    {
      label: copied ? t.copied : t.copy,
      icon: copied ? Check : Copy,
      action: copyLink,
    },
    { label: t.telegram, icon: Share2, action: shareTelegram },
    { label: t.whatsapp, icon: Share2, action: shareWhatsApp },
    { label: t.native, icon: Share2, action: shareNative },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface2 active:scale-[0.98]"
        aria-expanded={open}
      >
        <Share2 className="h-4 w-4" />
        {t.button}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t.title}
            className="w-full max-w-sm rounded-2xl border border-line bg-surface p-3 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 py-2">
              <span className="text-base font-semibold text-ink">
                {t.title}
              </span>

              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t.close}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-surface2"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              {options.map(({ label, icon: Icon, action }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void action();
                  }}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-ink transition hover:bg-surface2 active:bg-surface2"
                >
                  <Icon className="h-5 w-5 shrink-0 text-muted" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
