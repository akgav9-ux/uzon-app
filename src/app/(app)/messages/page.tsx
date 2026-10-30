"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";
import { ChatList, ChatRoom } from "@/components/chat";
import { useApp } from "@/components/providers";
import { cn } from "@/lib/utils";

function MessagesInner() {
  const { t } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get("id");

  useEffect(() => {
    if (active) document.title = `${t("chat.title")} · UZON`;
  }, [active, t]);

  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-hidden",
        active
  ? "fixed inset-0 z-50 h-[100dvh] bg-background md:static md:z-0 md:h-[calc(100dvh-6rem)]" // 🔥 6rem
  : "h-[calc(100dvh-4rem)]"
      )}
    >
      {!active && (
        <header className="flex shrink-0 items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold text-ink">{t("chat.title")}</h1>
        </header>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {active ? (
          <ChatRoom conversationId={active} onBack={() => router.push("/messages")} />
        ) : (
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <ChatList onOpen={(conversation) => router.push(`/messages?id=${conversation.id}`)} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesInner />
    </Suspense>
  );
}