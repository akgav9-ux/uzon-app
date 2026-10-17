"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Suspense, useState } from "react";
import { useApp } from "@/components/providers";
import { UzonMark, UzonWordmark } from "@/components/logo";
import { Button, Card, Field, Input } from "@/components/ui";
import { post as postApi } from "@/lib/client/api";

type RecoverResponse = { sent: boolean; delivered?: boolean; reason?: string | null; devLink?: string | null };

function RecoverInner() {
  const { t, toast } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RecoverResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const request = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await postApi<RecoverResponse>("/api/auth", { action: "recover", identifier }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const reset = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postApi("/api/auth", { action: "reset", token, password });
      toast(t("auth.resetDone"), "success");
      router.replace("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="uz-ornament flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <Link href="/" className="flex items-center justify-center gap-2.5">
          <UzonMark size={40} />
          <UzonWordmark />
        </Link>
        <Card className="space-y-4 p-5">
          <h1 className="flex items-center gap-2 text-base font-semibold text-ink">
            <KeyRound className="h-4 w-4 text-brand" />
            {t("auth.recover")}
          </h1>

          {token ? (
            <form className="space-y-3" onSubmit={reset}>
              <Field label={t("auth.newPassword")} required error={error} hint="min 8">
                <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="new-password" />
              </Field>
              <Button type="submit" className="w-full" size="lg" loading={busy}>
                {t("common.save")}
              </Button>
            </form>
          ) : (
            <form className="space-y-3" onSubmit={request}>
              <Field label={`${t("auth.username")} / ${t("auth.email")}`} required>
                <Input value={identifier} onChange={(event) => setIdentifier(event.target.value)} required />
              </Field>
              <Button type="submit" className="w-full" size="lg" loading={busy}>
                {t("auth.recover")}
              </Button>
              {result && (
                <div className="space-y-2 rounded-xl border border-line bg-surface2 p-3 text-[11px]">
                  <p className="text-ink">{t("auth.recoverSent")}</p>
                  {result.delivered === false && (
                    <>
                      <p className="text-warning">{t("auth.recoverDev")}</p>
                      <p className="text-muted">{result.reason}</p>
                      {result.devLink && (
                        <a href={result.devLink} className="block break-all text-brand underline">
                          {result.devLink}
                        </a>
                      )}
                    </>
                  )}
                </div>
              )}
              {error && <p className="text-xs text-danger">{error}</p>}
            </form>
          )}

          <Link href="/login" className="block text-center text-xs text-brand hover:underline">
            {t("auth.haveAccount")}
          </Link>
        </Card>
      </div>
    </div>
  );
}

export default function RecoverPage() {
  return (
    <Suspense fallback={null}>
      <RecoverInner />
    </Suspense>
  );
}
