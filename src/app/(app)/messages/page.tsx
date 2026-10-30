"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";
import { ChatList, ChatRoom } from "@/components/chat";
import { useApp } from "@/components/providers";

function MessagesInner() {
  const { t } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get("id");

  useEffect(() => {
    if (active) document.title = `${t("chat.title")} · UZON`;
  }, [active, t]);

  return (
    // 🔥 Для открытого чата занимаем 100dvh, для списка чатов — с учетом шапки
    <div className={active ? "fixed inset-0 z-50 flex h-[100dvh] flex-col overflow-hidden bg-background" : "flex h-[calc(100dvh-4rem)] flex-col overflow-hidden"}>
      
      {/* 🔥 Надпись "Сообщения" показываем только в списке чатов (когда чат не открыт) */}
      {!active && (
        <header className="flex shrink-0 items-center justify-between px-3 pb-2">
          <h1 className="text-xl font-semibold text-ink">{t("chat.title")}</h1>
        </header>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {active ? (
          <ChatRoom conversationId={active} onBack={() => router.push("/messages")} />
        ) : (
          <div className="flex-1 overflow-y-auto px-3">
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