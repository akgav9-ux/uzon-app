
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers";
import { Spinner } from "@/components/ui";

export default function OwnProfilePage() {
  const { user, authLoading, t } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && user) router.replace(`/u/${user.username}`);
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  return (
    <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted">
      <Spinner />
      {t("common.loading")}
    </div>
  );
}
