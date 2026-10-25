"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createDeposit } from "@/actions/wallet";
import { formatMoney, parseAmount } from "@/lib/money";
import { compressImage } from "@/lib/compress-image";
import type { ManualMethodView } from "@/lib/manual-methods";
import { CopyButton } from "./CopyButton";
import { Turnstile } from "./Turnstile";
import { PhoneInput } from "./PhoneInput";
import { PayLogo } from "./PayLogo";

const HTG_PRESETS = [250, 500, 1000, 2500];
const USD_PRESETS = [10, 25, 50, 100];

type Method = {
  key: string;
  kind: "moncash" | "mobile" | "crypto";
  name: string;
  mark: string;
  markBg: string;
  markFg: string;
  logo?: string | null;
  /** MonCash / NatCash: their own logo replaces the tile and the name */
  brand?: "moncash" | "natcash";
  recipientName: string;
  recipientNumber: string;
  qr?: string | null;
  network?: string | null;
  instructions?: string;
  manualId?: string;
};

type Props = {
  moncash: boolean;
  natcash: boolean;
  natcashName: string;
  natcashPhone: string;
  natcashQr: string;
  manual: ManualMethodView[];
  minHtg: number;
  maxHtg: number;
  htgPerUsd: number;
};

export function DepositForm(p: Props) {
  const tw = useTranslations("wallet");
  const to = useTranslations("order");
  const tc = useTranslations("common");
  const tco = useTranslations("checkout");
  const tu = useTranslations("walletUi");
  const locale = useLocale();
  const router = useRouter();

  const methods: Method[] = [
    ...(p.moncash ? [{ key: "MONCASH", kind: "moncash" as const, name: "MonCash", brand: "moncash" as const, mark: "MC", markBg: "#E30613", markFg: "#fff", recipientName: "", recipientNumber: "" }] : []),
    ...(p.natcash ? [{ key: "NATCASH", kind: "mobile" as const, name: "NatCash", brand: "natcash" as const, mark: "NC", markBg: "#F27A1A", markFg: "#fff", recipientName: p.natcashName, recipientNumber: p.natcashPhone, qr: p.natcashQr || null }] : []),
    ...p.manual.map((m) => ({
      key: `MANUAL:${m.id}`,
      kind: m.kind,
      name: m.name,
      mark: m.kind === "crypto" ? "₮" : m.name.slice(0, 2).toUpperCase(),
      markBg: m.kind === "crypto" ? "#26a17b" : "#334155",
      markFg: "#fff",
      logo: m.logo,
      recipientName: m.recipientName,
      recipientNumber: m.recipientNumber,
      qr: m.qrImage,
      network: m.network,
      instructions: m.instructions,
      manualId: m.id,
    })),
  ];
  const [key, setKey] = useState(methods[0]?.key ?? "");
  const m = methods.find((x) => x.key === key) ?? methods[0];
  const crypto = m?.kind === "crypto";
  const [amount, setAmount] = useState("1000");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [pending, start] = useTransition();
  const [guide, setGuide] = useState(false);
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);
  const [shotBusy, setShotBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [genQr, setGenQr] = useState<string | null>(null);

  // Crypto addresses get a generated QR when staff did not upload one.
  useEffect(() => {
    setGenQr(null);
    if (!m || m.kind !== "crypto" || m.qr) return;
    let alive = true;
    import("qrcode").then((QR) => QR.toDataURL(m.recipientNumber, { margin: 1, width: 360 })).then((u) => alive && setGenQr(u)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [m?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (shot) URL.revokeObjectURL(shot.url);
    };
  }, [shot]);

  const switchTo = (k: string) => {
    const next = methods.find((x) => x.key === k);
    if (next && (next.kind === "crypto") !== crypto) setAmount(next.kind === "crypto" ? "25" : "1000");
    setKey(k);
    setError("");
  };

  const minor = parseAmount(amount);
  const currency = crypto ? "USD" : "HTG";
  const minUsd = Math.ceil(p.minHtg / p.htgPerUsd);
  const maxUsd = Math.floor(p.maxHtg / p.htgPerUsd);
  const hint = crypto
    ? tw("amountHint", { min: formatMoney(minUsd, "USD", locale), max: formatMoney(maxUsd, "USD", locale) })
    : tw("amountHint", { min: formatMoney(p.minHtg, "HTG", locale), max: formatMoney(p.maxHtg, "HTG", locale) });

  const errors: Record<string, string> = {
    amount: hint,
    reference: to("reference"),
    tx_hash: tw("txHashError"),
    duplicate_ref: to("duplicateRef"),
    new_account_limit: tco("errors.new_account_limit"),
    method_unavailable: tco("errors.method_unavailable"),
    upload: tw("uploadBad"),
    captcha: tc("captcha"),
    verify_email: tco("errors.verify_email"),
  };

  async function pickShot(f: File | undefined) {
    if (!f) return;
    setError("");
    setShotBusy(true);
    try {
      const small = await compressImage(f);
      setShot({ file: small, url: URL.createObjectURL(small) });
    } catch {
      setShot(null);
      setError(tw("uploadBad"));
    } finally {
      setShotBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (!m) return <p className="card p-6 text-sm text-muted">{tco("errors.method_unavailable")}</p>;

  if (done)
    return (
      <div className="card animate-rise p-8 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success text-white shadow-[0_0_0_10px_var(--success-soft)]">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        </span>
        <p className="mt-5 text-lg font-bold">{tw("depositSubmitted")}</p>
        <button type="button" className="btn-primary mt-6" onClick={() => router.push("/account/wallet")}>{tc("wallet")}</button>
      </div>
    );

  const steps = crypto
    ? [tw("cryptoSteps1"), tw("cryptoSteps2", { network: m.network ?? "" }), tw("cryptoSteps3")]
    : m.kind === "mobile"
      ? [m.qr ? tw("stepScan") : tw("stepSend", { name: m.name }), tw("stepAmount"), tw("stepRef")]
      : [];

  return (
    <form
      className="flex flex-col gap-[18px]"
      action={(fd) =>
        start(async () => {
          setError("");
          fd.set("method", m.manualId ? "MANUAL" : m.key);
          if (m.manualId) fd.set("manualMethodId", m.manualId);
          fd.delete("evidence");
          if (shot) fd.set("evidence", shot.file);
          const r = await createDeposit(fd);
          if (!r.ok) {
            setCaptchaKey((k) => k + 1); // bot-check tokens are single-use
            return setError(errors[r.error] ?? tc("error"));
          }
          if (r.redirect) window.location.href = r.redirect;
          else setDone(true);
        })
      }
    >
      {/* Amount (mockup: four quick amounts, another amount below) */}
      <section className="flex flex-col gap-2.5">
        <h2 className="text-base font-bold">{tu("addFunds")}</h2>
        <div className="grid grid-cols-4 gap-2">
          {(crypto ? USD_PRESETS : HTG_PRESETS).map((v) => (
            <button key={v} type="button" onClick={() => setAmount(String(v))}
              className={`min-h-[46px] rounded-xl border text-sm font-bold ${minor === v * 100 ? "border-text bg-text text-surface" : "border-border bg-surface text-text"}`}>
              {crypto ? `$${v}` : v.toLocaleString("en-US")}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">{tu("otherAmount")}</span>
          <span className="relative flex-1">
            {crypto && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-muted">$</span>}
            <input id="amount" name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} required
              className={`h-11 w-full rounded-xl border border-border bg-surface text-base font-bold ${crypto ? "pl-8 pr-3" : "pl-3 pr-14"}`} />
            {!crypto && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-semibold text-muted">HTG</span>}
          </span>
        </label>
        <p className="text-xs text-muted">{hint}</p>
      </section>

      {/* Payment method (mockup: one card per method with a radio dot) */}
      <section className="flex flex-col gap-2.5">
        <h2 className="text-base font-bold">{tu("method")}</h2>
        <div role="radiogroup" aria-label={tu("method")} className="flex flex-col gap-2.5">
          {methods.map((x) => {
            const on = x.key === m.key;
            const meta = x.kind === "moncash" ? tu("metaAuto") : x.kind === "crypto" ? tu("metaCrypto", { network: x.network ?? "" }) : tu("metaManual");
            return (
              <button key={x.key} type="button" role="radio" aria-checked={on} onClick={() => switchTo(x.key)}
                className={`flex items-center gap-3 rounded-[14px] border-2 bg-surface px-3.5 py-3 text-left ${on ? "border-text" : "border-border"}`}>
                {x.brand ? (
                  <span className="flex h-[42px] w-[104px] flex-none items-center justify-center keep-white rounded-xl border border-[#E5E7EF] bg-white px-2"><PayLogo brand={x.brand} height={20} /></span>
                ) : x.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={x.logo} alt="" className="h-[42px] w-[42px] keep-white flex-none rounded-xl bg-white object-contain p-1" />
                ) : (
                  <span className="grid h-[42px] w-[42px] flex-none place-items-center rounded-xl text-[13px] font-extrabold" style={{ background: x.markBg, color: x.markFg }}>{x.mark}</span>
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={x.brand ? "sr-only" : "text-[15px] font-bold"}>{x.name}</span>
                  <span className="text-xs text-muted">{meta}</span>
                </span>
                <span className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full border-2 ${on ? "border-text" : "border-[#94A3B8]"}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${on ? "bg-text" : ""}`} />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Where to send */}
      {m.kind !== "moncash" && (
        <section className="card overflow-hidden">
          <div className={`grid gap-4 p-4 sm:p-5 ${m.qr || genQr ? "sm:grid-cols-[auto_1fr]" : ""}`}>
            {(m.qr || genQr) && (
              <div className="relative mx-auto w-44 shrink-0 rounded-2xl bg-white p-2.5 shadow-sm sm:mx-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.qr || genQr!} alt={`QR ${m.name}`} className="aspect-square w-full object-contain" />
                {crypto && !m.qr && (
                  <span className="absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl border-4 border-white bg-[#26a17b] text-lg font-black text-white">₮</span>
                )}
              </div>
            )}
            <div className="min-w-0 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">{crypto ? `${tw("cryptoAddress")} · ${m.network}` : tw("sendTo")}</p>
              {!crypto && <p className="font-bold">{m.recipientName}</p>}
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 py-1.5 pl-3 pr-1.5">
                <span className={`min-w-0 flex-1 font-mono font-bold ${crypto ? "break-all text-sm" : "text-lg"}`}>{m.recipientNumber}</span>
                <CopyButton value={crypto ? m.recipientNumber : m.recipientNumber.replace(/\s/g, "")} label={to("copy")} done={to("copied")} />
              </div>
              {crypto && <p className="text-xs font-semibold text-success">{tw("cryptoCredit")}</p>}
            </div>
          </div>
          {crypto && (
            <p role="note" className="flex gap-2 border-t border-border bg-danger-soft px-4 py-3 text-sm text-danger sm:px-5">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="mt-0.5 shrink-0" aria-hidden><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17.5v.01" /></svg>
              <span>{tw("cryptoWarn", { network: m.network ?? "" })}</span>
            </p>
          )}
          {m.instructions && <p className="whitespace-pre-line border-t border-border px-4 py-3 text-sm sm:px-5">{m.instructions}</p>}
        </section>
      )}


      {steps.length > 0 && (
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary-soft text-xs font-black text-primary">{i + 1}</span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-col gap-4">
        {m.kind !== "moncash" && (
          <>
            {/* Reference / transaction hash */}
            <div>
              <label className="label" htmlFor="reference">{crypto ? tw("txHash") : to("reference").replace("NatCash", m.name)}</label>
              <input
                id="reference"
                name="reference"
                required
                autoComplete="off"
                spellCheck={false}
                {...(crypto
                  ? { pattern: "(0x)?[0-9a-fA-F]{64}", maxLength: 66, placeholder: "0x…" }
                  : { minLength: 4, maxLength: 40, placeholder: to("referencePlaceholder"), inputMode: "text" as const })}
                className={`input h-12 font-mono ${crypto ? "text-sm" : "text-base tracking-wider"}`}
              />
              {crypto ? (
                <p className="mt-1.5 text-xs text-muted">{tw("txHashHint")}</p>
              ) : (
                <button type="button" onClick={() => setGuide(true)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-primary">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.01" /></svg>
                  {tw("refHelp")}
                </button>
              )}
            </div>

            {!crypto && (
              <div>
                <label className="label" htmlFor="payerPhone">{to("payerPhone")}</label>
                <PhoneInput id="payerPhone" name="payerPhone" className="input h-12" />
              </div>
            )}

            {/* Screenshot: compressed in the browser, then sent with the form */}
            <div>
              <input ref={fileRef} id="evidence-pick" type="file" accept="image/*" className="sr-only" onChange={(e) => pickShot(e.target.files?.[0])} />
              {shot ? (
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={shot.url} alt="" className="h-16 w-16 rounded-xl object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">✓ {tw("uploadTitle")}</span>
                    <span className="text-xs text-muted">{Math.max(1, Math.round(shot.file.size / 1024))} KB</span>
                  </span>
                  <label htmlFor="evidence-pick" className="btn-secondary min-h-10 cursor-pointer px-3 text-xs">{tw("uploadChange")}</label>
                  <button type="button" onClick={() => setShot(null)} className="min-h-10 px-2 text-xs font-semibold text-danger">{tw("uploadRemove")}</button>
                </div>
              ) : (
                <label
                  htmlFor="evidence-pick"
                  className="flex min-h-[4.5rem] cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-surface-2/60 px-4 text-center transition-colors hover:border-primary"
                >
                  {shotBusy ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className="text-primary" aria-hidden><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="12" cy="12" r="3.2" /><path d="M8 5l1.2-2h5.6L16 5" /></svg>
                  )}
                  <span className="text-left">
                    <span className="block text-sm font-bold">{tw("uploadTitle")}</span>
                    <span className="block text-xs text-muted">{tw("uploadHint")}</span>
                  </span>
                </label>
              )}
            </div>
          </>
        )}

        {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p>}
        <Turnstile key={captchaKey} locale={locale} />
        <button className="h-[54px] w-full rounded-[14px] bg-text text-base font-bold text-surface disabled:bg-surface-2 disabled:text-muted" disabled={pending || !minor || shotBusy}>
          {pending ? tc("loading") : m.kind === "moncash" ? tu("pay", { amount: formatMoney(minor ?? 0, currency, locale), method: m.name }) : tu("send", { amount: minor ? formatMoney(minor, currency, locale) : "" })}
        </button>
      </div>

      {/* Reference guide: bottom sheet on phones, centered card on desktop */}
      {guide && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setGuide(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="guide-title" className="animate-rise w-full max-w-md space-y-4 rounded-t-3xl bg-surface p-5 pb-8 sm:rounded-3xl sm:pb-5" onClick={(e) => e.stopPropagation()}>
            <span className="mx-auto block h-1.5 w-11 rounded-full bg-border sm:hidden" aria-hidden />
            <div className="flex items-center gap-3">
              <h2 id="guide-title" className="display flex-1 text-xl font-bold">{tw("refHelpTitle")}</h2>
              <button type="button" onClick={() => setGuide(false)} aria-label={tc("close")} className="grid h-10 w-10 place-items-center rounded-xl border border-border">✕</button>
            </div>
            <p className="text-sm text-muted">{tw("refHelpBody", { name: m.name })}</p>
            <div className="rounded-2xl border border-border bg-surface-2 p-4 text-sm leading-relaxed">
              <span className="text-xs font-bold text-muted">SMS · {m.name}</span>
              <br />
              {tw("refHelpExample", { recipient: m.recipientName.toUpperCase(), ref: "§" }).split("§").map((part, i) =>
                i === 0 ? part : (
                  <span key={i}>
                    <mark className="rounded bg-[#f7a400] px-1 font-mono font-bold text-[#060b1a]">20261014094821</mark>
                    {part}
                  </span>
                ),
              )}
            </div>
            <p className="flex gap-2 text-sm"><span className="font-bold text-success">✓</span>{tw("refHelpApp")}</p>
            <button type="button" className="btn-primary min-h-12 w-full" onClick={() => setGuide(false)}>{tw("gotIt")}</button>
          </div>
        </div>
      )}
    </form>
  );
}
