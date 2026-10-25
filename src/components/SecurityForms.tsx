"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

export function SecurityForms() {
  const ts = useTranslations("security");
  const tc = useTranslations("common");
  const ta = useTranslations("auth");
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <form
        className="card space-y-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          const r = await authClient.changePassword({
            currentPassword: String(f.get("current")),
            newPassword: String(f.get("next")),
            revokeOtherSessions: true,
          });
          setBusy(false);
          setMsg(r.error ? { ok: false, text: (r.error as { code?: string }).code === "PASSWORD_COMPROMISED" ? ta("compromised") : ta("invalid") } : { ok: true, text: ts("passwordChanged") });
          if (!r.error) (e.target as HTMLFormElement).reset();
        }}
      >
        <h2 className="font-semibold">{ts("changePassword")}</h2>
        <div>
          <label className="label" htmlFor="current">{ts("currentPassword")}</label>
          <input id="current" name="current" type="password" required autoComplete="current-password" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="next">{ts("newPassword")}</label>
          <input id="next" name="next" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="input" />
          <p className="mt-1 text-xs text-muted">{ta("passwordHint")}</p>
        </div>
        <button className="btn-primary" disabled={busy}>{tc("save")}</button>
      </form>
      <button
        type="button"
        className="btn-secondary"
        onClick={async () => {
          await authClient.revokeOtherSessions();
          setMsg({ ok: true, text: ts("revoked") });
          router.refresh();
        }}
      >
        {ts("revokeOthers")}
      </button>
      {msg && <p className={`rounded-xl px-4 py-3 text-sm ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`} role="status">{msg.text}</p>}
    </>
  );
}
