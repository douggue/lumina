"use client";
import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { pollWhatsAppVerify, startWhatsAppVerify, submitTrial } from "@/actions/trial";
import { checkLink, isShortLink, linkExample, PLATFORMS } from "@/lib/services";
import { Turnstile, turnstileOn } from "./Turnstile";

type Offer = { key: string; label: string; avg: string; platform: string; post: boolean };

/**
 * Free trial (mockup "Eseye gratis"): pick offer, paste link, verify phone via WhatsApp
 * (customer SENDS a server-issued code to our WA Business number), then submit.
 */
export function TrialForm({ offers, signedIn }: { offers: Offer[]; signedIn: boolean }) {
  const t = useTranslations("trialUi");
  const locale = useLocale();
  const [pick, setPick] = useState(0);
  const [link, setLink] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [waUrl, setWaUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [verified, setVerified] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const cur = offers[pick];
  if (!cur) return null;

  const check = link.trim() ? checkLink(link, cur.platform, cur.post) : null;
  const linkError =
    check && !check.ok
      ? t.has(`err_${check.error}`)
        ? t(`err_${check.error}`, { platform: cur.platform, example: linkExample(cur.platform, cur.post) })
        : t("error_link")
      : "";
  const shortHint = check?.ok && isShortLink(check.url, cur.platform) ? t("shortLinkHint") : "";
  const linkOk = check?.ok && !shortHint ? (cur.post ? t("okPost") : t("okProfile")) : "";
  const phoneReady = phone.replace(/\D/g, "").length >= 8;
  const codeIssued = !!code && !!waUrl;

  // Poll Backend webhook confirmation while waiting (stub returns verified:false until Backend lands).
  useEffect(() => {
    if (!codeIssued || verified || !waiting) return;
    let stop = false;
    const tick = async () => {
      const r = await pollWhatsAppVerify({ phone, code });
      if (!stop && r.ok && r.verified) {
        setVerified(true);
        setWaiting(false);
      }
    };
    const id = setInterval(tick, 3000);
    tick();
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [codeIssued, verified, waiting, phone, code]);

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3.5 px-2.5 py-10 text-center">
        <span className="grid h-[72px] w-[72px] place-items-center rounded-full bg-success-soft text-success">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        <p className="text-[22px] font-extrabold text-text">{t("doneTitle")}</p>
        <p className="text-sm leading-normal text-text/80">{t("doneBody", { offer: cur.label })}</p>
        <Link href="/account/wallet" className="mt-2 flex h-[52px] items-center rounded-[14px] bg-text px-[22px] text-[15px] font-bold text-surface">
          {t("doneCta")}
        </Link>
        <Link href="/account/orders" className="text-sm font-bold text-cyan">
          {t("doneOrders")}
        </Link>
      </div>
    );
  }

  const label = "text-[13px] font-bold uppercase tracking-[0.6px] text-muted";
  const field = "h-[50px] rounded-xl border border-border bg-surface px-3.5 text-base text-text";
  const sendWa = () => {
    setError("");
    start(async () => {
      const r = await startWhatsAppVerify({ phone });
      if (!r.ok) {
        setError(t.has(`error_${r.error}`) ? t(`error_${r.error}`) : t("error_generic"));
        return;
      }
      setCode(r.code);
      setWaUrl(r.waUrl);
      setExpiresAt(r.expiresAt);
      setWaiting(true);
      setVerified(false);
      window.open(r.waUrl, "_blank", "noopener,noreferrer");
    });
  };

  return (
    <form
      className="flex flex-col gap-[18px]"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        if (!isPublic) {
          setError(t("error_not_public"));
          return;
        }
        if (!codeIssued) {
          setError(t("error_phone"));
          return;
        }
        if (!verified) {
          setError(t("waiting"));
          setWaiting(true);
          return;
        }
        start(async () => {
          const r = await submitTrial({ offer: cur.key, link, phone });
          if (r.ok) setDone(true);
          else {
            setError(t.has(`error_${r.error}`) ? t(`error_${r.error}`) : t("error_generic"));
            setCaptchaKey((k) => k + 1);
            setCaptcha("");
          }
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
            <button
              key={o.key}
              type="button"
              aria-pressed={on}
              onClick={() => setPick(i)}
              className={`flex items-center gap-3 rounded-[14px] border-2 bg-surface px-3.5 py-3 text-left ${on ? "border-text" : "border-border"}`}
            >
              <span className="grid h-10 w-10 flex-none place-items-center rounded-[11px] text-[13px] font-extrabold text-white" style={{ background: p?.color }}>
                {p?.letter}
              </span>
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-bold text-text">{o.label}</span>
                <span className="text-xs text-muted">{t("avg", { time: o.avg })}</span>
              </span>
              <span className="rounded-full bg-success-soft px-2.5 py-[5px] text-xs font-extrabold text-success">{t("free")}</span>
            </button>
          );
        })}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={label}>{t("step2")}</h2>
        <label htmlFor="tlink" className="text-sm font-semibold text-text">
          {cur.post ? t("linkPost") : t("linkProfile")}
        </label>
        <input
          id="tlink"
          type="url"
          inputMode="url"
          required
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder={linkExample(cur.platform, cur.post)}
          className={`${field} ${linkError ? "border-2 border-danger" : linkOk ? "border-2 border-success" : ""}`}
        />
        {linkError && <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2.5 text-[13px] leading-normal text-danger">{linkError}</p>}
        {shortHint && <p className="rounded-[10px] bg-warning-soft px-3 py-2.5 text-[13px] text-warning">{shortHint}</p>}
        {linkOk && <p className="rounded-[10px] bg-success-soft px-3 py-2.5 text-[13px] text-success">{linkOk}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={label}>{t("step3")}</h2>
        <label htmlFor="phone" className="text-sm font-semibold text-text">
          {t("phone")}
        </label>
        <div className="flex gap-2">
          <span className="flex h-[50px] items-center rounded-xl border border-border bg-surface-2 px-3 font-bold text-text">+509</span>
          <input
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            required
            placeholder="3X XX XXXX"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setCode("");
              setWaUrl("");
              setVerified(false);
              setWaiting(false);
            }}
            className={`${field} min-w-0 flex-1`}
          />
        </div>
        <p className="text-xs text-muted">{t("phoneHint")}</p>

        {!codeIssued ? (
          <button
            type="button"
            disabled={pending || !phoneReady || !signedIn}
            onClick={sendWa}
            className="min-h-[46px] rounded-xl border border-text bg-surface text-sm font-bold text-text disabled:border-border disabled:text-muted"
          >
            {pending ? "…" : t("sendWa")}
          </button>
        ) : (
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-2 p-3.5">
            <label htmlFor="code" className="text-sm font-semibold text-text">
              {t("codeLabel")}
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              readOnly
              value={code}
              className="h-[50px] rounded-xl border-2 border-text bg-surface px-3.5 text-center text-xl font-extrabold tracking-[6px] text-text"
            />
            <p className="text-[13px] leading-normal text-muted">{t("codeHint")}</p>
            {waiting && !verified && (
              <p className="text-[13px] font-semibold text-warning" aria-live="polite">
                {t("waiting")}
              </p>
            )}
            {verified && <p className="text-[13px] font-semibold text-success">{t("verified")}</p>}
            <div className="flex flex-wrap gap-2">
              <a href={waUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-[#15803D] px-3 text-sm font-bold text-white">
                {t("openWa")}
              </a>
              <button type="button" disabled={pending} onClick={sendWa} className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm font-bold text-text">
                {t("resendWa")}
              </button>
            </div>
            {expiresAt && (
              <p className="text-[11px] text-muted">
                {t("expires", { time: new Date(expiresAt).toLocaleTimeString(locale === "fr" ? "fr-HT" : "ht-HT", { hour: "2-digit", minute: "2-digit" }) })}
              </p>
            )}
          </div>
        )}
      </section>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-border bg-surface p-3.5 text-[13px] leading-normal text-text">
        <input type="checkbox" checked={isPublic} onChange={() => setIsPublic((v) => !v)} className="m-0 h-[22px] w-[22px] flex-none accent-text" />
        <span>{t("publicConfirm")}</span>
      </label>

      <Turnstile key={captchaKey} onToken={setCaptcha} locale={locale} />

      {error && (
        <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          {error}
        </p>
      )}
      {signedIn ? (
        <button
          disabled={pending || !link.trim() || !phoneReady || !!linkError || !codeIssued || !verified || !isPublic || (turnstileOn && !captcha)}
          className="h-[54px] rounded-[14px] bg-text text-base font-bold text-surface disabled:bg-surface-2 disabled:text-muted"
        >
          {t("submit")}
        </button>
      ) : (
        <Link href="/auth/register?next=/trial" className="flex h-[54px] items-center justify-center rounded-[14px] bg-text text-base font-bold text-surface">
          {t("signIn")}
        </Link>
      )}
      <p className="text-xs leading-normal text-muted">{t("footer")}</p>
    </form>
  );
}
