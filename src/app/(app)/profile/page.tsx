"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers";
import { Spinner } from "@/components/ui";
import { ShareUzonButton } from "@/components/share-uzon-button";

{p.isSelf ? (
  <Link href="/settings">
    <Button size="sm" variant="secondary" icon={<Settings className="h-3.5 w-3.5" />}>
      {t("profile.edit")}
    </Button>
  </Link>
) : (
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
