"use client";

import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
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
    <div className="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between px-3 pb-2">
        <h1 className="text-xl font-semibold text-ink">{t("chat.title")}</h1>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        {active ? (
          <ChatRoom conversationId={active} onBack={() => router.push("/messages")} />
        ) : (
          <div className="flex-1 overflow-y-auto">
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