"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { submitTrial } from "@/actions/trial";
import { checkLink, linkExample, PLATFORMS } from "@/lib/services";

type Offer = { key: string; label: string; avg: string; platform: string; post: boolean };

/** Free trial (mockup "Eseye gratis"): pick the trial, paste the link, give a phone number. */
export function TrialForm({ offers, signedIn }: { offers: Offer[]; signedIn: boolean }) {
  const t = useTranslations("trialUi");
  const [pick, setPick] = useState(0);
  const [link, setLink] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const cur = offers[pick];
  if (!cur) return null;
  const linkBad = link.trim() !== "" && !checkLink(link, cur.platform, cur.post).ok;

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3.5 px-2.5 py-10 text-center">
        <span className="grid h-[72px] w-[72px] place-items-center rounded-full bg-[#DCFCE7] text-[#166534]">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
        </span>
        <p className="text-[22px] font-extrabold">{t("doneTitle")}</p>
        <p className="text-sm leading-normal text-text/80">{t("doneBody", { offer: cur.label })}</p>
        <Link href="/account/wallet" className="mt-2 flex h-[52px] items-center rounded-[14px] bg-text px-[22px] text-[15px] font-bold text-surface">{t("doneCta")}</Link>
        <Link href="/account/orders" className="text-sm font-bold text-[#00209F] dark:text-primary">{t("doneOrders")}</Link>
      </div>
    );
  }

  const label = "text-[13px] font-bold uppercase tracking-[0.6px] text-muted";
  return (
    <form
      className="flex flex-col gap-[18px]"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        start(async () => {
          const r = await submitTrial({ offer: cur.key, link, phone });
          if (r.ok) setDone(true);
          else setError(t.has(`error_${r.error}`) ? t(`error_${r.error}`) : t("error_generic"));
        });
      }}
    >
      <p className="text-sm leading-normal text-text/80">{t.rich("intro", { b: (c) => <b>{c}</b> })}</p>

      <section className="flex flex-col gap-2.5">
        <h2 className={label}>{t("step1")}</h2>
        {offers.map((o, i) => {
          const p = PLATFORMS[o.platform];
          const on = i === pick;
          return (
            <button key={o.key} type="button" aria-pressed={on} onClick={() => setPick(i)} className={`flex items-center gap-3 rounded-[14px] border-2 bg-surface px-3.5 py-3 text-left ${on ? "border-text" : "border-border"}`}>
              <span className="grid h-10 w-10 flex-none place-items-center rounded-[11px] text-[13px] font-extrabold text-white" style={{ background: p?.color }}>{p?.letter}</span>
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-bold">{o.label}</span>
                <span className="text-xs text-muted">{t("avg", { time: o.avg })}</span>
              </span>
              <span className="rounded-full bg-[#DCFCE7] px-2.5 py-[5px] text-xs font-extrabold text-[#166534]">{t("free")}</span>
            </button>
          );
        })}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={label}>{t("step2")}</h2>
        <label htmlFor="tlink" className="text-sm font-semibold">{cur.post ? t("linkPost") : t("linkProfile")}</label>
        <input id="tlink" type="url" inputMode="url" required value={link} onChange={(e) => setLink(e.target.value)} placeholder={linkExample(cur.platform, cur.post)}
          className={`h-[50px] rounded-xl bg-surface px-3.5 text-base ${linkBad ? "border-2 border-[#DC2626]" : "border border-[#CBD2E1] dark:border-border"}`} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={label}>{t("step3")}</h2>
        <label htmlFor="phone" className="text-sm font-semibold">{t("phone")}</label>
        <div className="flex gap-2">
          <span className="flex h-[50px] items-center rounded-xl border border-[#CBD2E1] bg-[#F8FAFC] px-3 font-bold text-[#0F172A] dark:border-border dark:bg-surface-2 dark:text-text">+509</span>
          <input id="phone" type="tel" inputMode="numeric" autoComplete="tel-national" required placeholder="3X XX XXXX" value={phone} onChange={(e) => setPhone(e.target.value)}
            className="h-[50px] min-w-0 flex-1 rounded-xl border border-[#CBD2E1] bg-surface px-3.5 text-base dark:border-border" />
        </div>
        <p className="text-xs text-muted">{t("phoneHint")}</p>
      </section>

      {error && <p role="alert" className="rounded-[10px] bg-[#FEE2E2] px-3 py-2.5 text-[13px] text-[#991B1B]">{error}</p>}
      {signedIn ? (
        <button disabled={pending || !link.trim() || !phone.trim() || linkBad} className="h-[54px] rounded-[14px] bg-text text-base font-bold text-surface disabled:bg-[#CBD5E1] disabled:text-[#475569]">{t("submit")}</button>
      ) : (
        <Link href="/auth/register?next=/trial" className="flex h-[54px] items-center justify-center rounded-[14px] bg-text text-base font-bold text-surface">{t("signIn")}</Link>
      )}
      <p className="text-xs leading-normal text-muted">{t("footer")}</p>
    </form>
  );
}
