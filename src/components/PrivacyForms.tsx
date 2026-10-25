"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { deleteAccount, savePrefs } from "@/actions/customer";

export function DeleteAccountForm({ hasPassword = true }: { hasPassword?: boolean }) {
  const tg = useTranslations("google");
  const t = useTranslations("privacy");
  const tc = useTranslations("common");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="card space-y-3 border-danger/40 p-5"
      action={(fd) =>
        start(async () => {
          setError("");
          if (!window.confirm(t("deleteTitle") + "?")) return;
          const r = await deleteAccount(String(fd.get("password")));
          if (r.ok) window.location.href = "/";
          else setError(t.has(r.error) ? t(r.error as "wrongPassword") : tc("error"));
        })
      }
    >
      <h2 className="font-semibold text-danger">{t("deleteTitle")}</h2>
      <p className="text-sm text-muted">{t("deleteBody")}</p>
      {hasPassword ? (
        <label className="block"><span className="label">{t("deleteConfirm")}</span><input name="password" type="password" required autoComplete="current-password" className="input" /></label>
      ) : (
        // Google accounts have no password: typing the account's email confirms instead.
        <label className="block"><span className="label">{tg("deleteConfirmEmail")}</span><input name="password" type="email" required autoComplete="off" className="input" /></label>
      )}
      {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p>}
      <button className="btn-danger" disabled={pending}>{t("deleteButton")}</button>
    </form>
  );
}

export function PrefsForm({ prefs, emailOn }: { prefs: { email?: boolean; whatsapp?: boolean; marketing?: boolean }; emailOn: boolean }) {
  const t = useTranslations("prefs");
  const tc = useTranslations("common");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <form className="card space-y-3 p-5" action={(fd) => start(async () => { const r = await savePrefs(fd); setMsg(r.ok ? t("saved") : tc("error")); })}>
      <h2 className="font-semibold">{t("title")}</h2>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="email" defaultChecked={prefs.email !== false} disabled={!emailOn && false} /> {t("email")}</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="whatsapp" defaultChecked={prefs.whatsapp !== false} /> {t("whatsapp")}</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="marketing" defaultChecked={!!prefs.marketing} /> {t("marketing")}</label>
      <p className="text-xs text-muted">{t("note")}</p>
      <div className="flex items-center gap-3">
        <button className="btn-secondary min-h-10" disabled={pending}>{tc("save")}</button>
        {msg && <span className="text-sm text-success" role="status">{msg}</span>}
      </div>
    </form>
  );
}
