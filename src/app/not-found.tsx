"use client";

import Link from "next/link";
import { Compass } from "lucide-react";
import { useApp } from "@/components/providers";
import { UzonMark } from "@/components/logo";
import { Button, EmptyState } from "@/components/ui";

export default function NotFound() {
  const { t } = useApp();
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <UzonMark size={48} className="mx-auto" />
        <EmptyState
          title={`404 · ${t("errors.notFound")}`}
          description={t("app.slogan")}
          icon={<Compass className="h-8 w-8" />}
          action={
            <Link href="/home">
              <Button>{t("errors.back")}</Button>
            </Link>
          }
        />
      </div>
    </div>
  );
}
