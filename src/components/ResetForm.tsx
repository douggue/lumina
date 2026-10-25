"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

export function ResetForm() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const sp = useSearchParams();
  const token = sp.get("token") ?? "";
  const [done, setDone] = useState(false);
  const [error, setError] = useState(sp.get("error") || !token ? t("resetInvalid") : "");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  return (
    <div className="card mx-auto w-full max-w-md space-y-4 p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">{t("resetTitle")}</h1>
      {done ? (
        <>
          <p className="rounded-xl bg-success-soft px-4 py-3 text-sm text-success" role="status">{t("resetDone")}</p>
          <Link href="/auth/login" className="btn-primary w-full">{tc("signIn")}</Link>
        </>
      ) : (
        <form
          method="post"
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const newPassword = String(new FormData(e.currentTarget).get("password"));
            const res = await authClient.resetPassword({ newPassword, token });
            setBusy(false);
            if (!res.error) return setDone(true);
            const { status, code } = res.error as { status: number; code?: string };
            if (code === "PASSWORD_COMPROMISED") setError(t("compromised"));
            else if (status === 429) setError(t("tooMany"));
            else setError(t("resetInvalid"));
          }}
        >
          <div>
            <label htmlFor="password" className="label">{t("password")}</label>
            <input id="password" name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="input" disabled={!token} />
            <p className="mt-1 text-xs text-muted">{t("passwordHint")}</p>
          </div>
          {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p>}
          <button className="btn-primary w-full" disabled={busy || !hydrated || !token}>{busy ? tc("loading") : t("resetSave")}</button>
          <Link href="/auth/forgot" className="block text-center text-sm font-semibold text-primary">{t("forgot")}</Link>
        </form>
      )}
    </div>
  );
}
