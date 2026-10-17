"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useApp } from "@/components/providers";
import { Button, ErrorState } from "@/components/ui";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useApp();
  useEffect(() => {
    console.error("[uzon]", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md space-y-3">
        <ErrorState message={error.message || t("errors.server")} onRetry={reset} />
        {error.digest && <p className="text-center text-[11px] text-muted">digest: {error.digest}</p>}
        <div className="flex justify-center gap-2">
          <Link href="/home">
            <Button variant="secondary" size="sm" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
              {t("errors.back")}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
