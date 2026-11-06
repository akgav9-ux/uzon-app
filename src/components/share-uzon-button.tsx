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
      toast("Ссылка на UZON скопирована", "success");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast(
        "Не удалось скопировать ссылку. Попробуй другой способ отправки.",
        "error",
      );
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
      await navigator.share({ title: "UZON", text: message, url });
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        toast("Не удалось открыть меню отправки", "error");
      }
    }
  };

  const options = [
    {
      label: copied ? "Ссылка скопирована" : "Копировать ссылку",
      icon: copied ? Check : Copy,
      action: copyLink,
    },
    { label: "Telegram", icon: Share2, action: shareTelegram },
    { label: "WhatsApp", icon: Share2, action: shareWhatsApp },
    {
      label: "Поделиться через телефон",
      icon: Share2,
      action: shareNative,
    },
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
        Поделиться UZON
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Поделиться UZON"
            className="w-full max-w-sm rounded-2xl border border-line bg-surface p-3 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 py-2">
              <span className="text-base font-semibold text-ink">
                Поделиться UZON
              </span>

              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
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