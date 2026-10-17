"use client";

import { ClipFeed } from "@/components/clips";
import { useApp } from "@/components/providers";

export default function ClipsPage() {
  const { t } = useApp();
  return (
    <section aria-label={t("clips.title")}>
      <ClipFeed />
    </section>
  );
}
