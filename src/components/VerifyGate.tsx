"use client";
import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { changeUnverifiedEmail } from "@/actions/customer";

const COOLDOWN = 60;

/**
 * Shown instead of checkout, deposit and exchange until the customer confirms their email.
 * The link in the email brings them back to this same page (cart kept: it lives in the browser).
 */
export function VerifyGate({ email }: { email: string }) {
  const t = useTranslations("verifyGate");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const back = `/${locale}${pathname === "/" ? "" : pathname}`;
  const [address, setAddress] = useState(email);
  const [wait, setWait] = useState(0);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [next, setNext] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const resend = () =>
    start(async () => {
      const r = await authClient.sendVerificationEmail({ email: address, callbackURL: back });
      setWait(COOLDOWN);
      setNote(r.error ? { ok: false, text: t("errors.generic") } : { ok: true, text: t("sent") });
    });

  const saveEmail = () =>
    start(async () => {
      const r = await changeUnverifiedEmail(next, back);
      if (!r.ok) return setNote({ ok: false, text: t.has(`errors.${r.error}`) ? t(`errors.${r.error}`) : t("errors.generic") });
      setAddress(next.trim().toLowerCase());
      setEditing(false);
      setWait(COOLDOWN);
      setNote({ ok: true, text: t("changed") });
    });

  return (
    <section className="card animate-rise mx-auto max-w-lg space-y-5 p-6 text-center sm:p-8" aria-labelledby="verify-title">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary-soft text-primary shadow-[0_0_30px_-8px_var(--glow)]" aria-hidden>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
          <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
          <path d="M12 14.5v2.5" />
        </svg>
      </span>
      <div className="space-y-2">
        <h1 id="verify-title" className="display text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted">{t("body")}</p>
        <p className="break-all rounded-xl bg-surface-2 px-3 py-2.5 text-sm font-semibold sm:text-base">{address}</p>
      </div>

      {note && (
        <p role="status" className={`rounded-xl px-4 py-2.5 text-sm ${note.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{note.text}</p>
      )}

      {editing ? (
        <div className="space-y-3 text-left">
          <label className="block">
            <span className="label">{t("newEmail")}</span>
            <input type="email" inputMode="email" autoComplete="email" value={next} onChange={(e) => setNext(e.target.value)} className="input h-12" />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn-primary min-h-12" disabled={pending || !next.includes("@")} onClick={saveEmail}>{t("save")}</button>
            <button type="button" className="btn-secondary min-h-12" onClick={() => setEditing(false)}>{t("cancel")}</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <button type="button" className="btn-primary min-h-12" disabled={pending || wait > 0} onClick={resend}>
            {wait > 0 ? t("wait", { s: wait }) : t("resend")}
          </button>
          <button type="button" className="btn-secondary min-h-12" onClick={() => router.refresh()}>{t("done")}</button>
          <button type="button" className="mt-1 text-sm font-semibold text-primary" onClick={() => { setEditing(true); setNext(""); setNote(null); }}>
            {t("wrong")} {t("change")}
          </button>
        </div>
      )}

      <p className="text-xs text-muted">{t("why")}</p>
    </section>
  );
}
