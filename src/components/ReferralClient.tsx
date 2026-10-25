"use client";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { earningsToWalletAction, withdrawEarnings } from "@/actions/referrals";
import { formatMoney } from "@/lib/money";
import { PayLogo } from "./PayLogo";
import { CopyButton } from "./CopyButton";

/** Tier card (mockup): current tier and %, progress to the next one, and the full tier list on demand. */
export function TierCard(p: {
  title: string; name: string; window: string; line: string; need: React.ReactNode; progress: number; showLabel: string; hideLabel: string;
  tiers: { key: string; name: string; pct: number; need: string; current: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col gap-3 rounded-[20px] bg-[#0F172A] p-[18px] dark:border dark:border-border dark:bg-surface-2 text-white">
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-text">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="9" r="6" /><polyline points="8.2 13.5 7 22 12 19 17 22 15.8 13.5" /></svg>
          </span>
          <span>
            <span className="block text-xs font-semibold text-white/55">{p.title}</span>
            <span className="block text-xl font-extrabold">{p.name}</span>
          </span>
        </div>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-white/70">{p.window}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-white/70">{p.line}</span>
        <span className="h-2.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-warning" style={{ width: `${p.progress}%` }} /></span>
        {p.need && <span className="text-[13px] leading-snug text-white/85">{p.need}</span>}
      </div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="min-h-10 self-start rounded-[10px] border border-white/20 px-3 text-[13px] font-bold">{open ? p.hideLabel : p.showLabel}</button>
      {open && (
        <ul className="flex flex-col gap-1.5">
          {p.tiers.map((x) => (
            <li key={x.key} className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm ${x.current ? "bg-white/10 text-warning" : "text-white/85"}`}>
              <span className="font-extrabold">{x.name}</span>
              <span className="flex-1 text-right text-xs text-white/55">{x.need}</span>
              <span className="min-w-10 text-right font-extrabold">{x.pct}%</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Earnings card: what can be withdrawn, what's waiting, withdraw to MonCash/NatCash (sheet) or move to the wallet. */
export function EarningsCard({ available, pending, min, name, phone }: { available: number; pending: number; min: number; name: string; phone: string }) {
  const t = useTranslations("refUi");
  const locale = useLocale();
  const router = useRouter();
  const fmt = (n: number) => formatMoney(n, "HTG", locale);
  const [sheet, setSheet] = useState(false);
  const [method, setMethod] = useState<"MONCASH" | "NATCASH">("MONCASH");
  const [amount, setAmount] = useState(String(available / 100));
  const [tel, setTel] = useState(phone);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sent, setSent] = useState(false);
  const [pendingTx, start] = useTransition();
  const canWithdraw = available >= min;
  const error = (code: string) => (t.has(`err_${code}`) ? t(`err_${code}`, { min: fmt(min) }) : t("err_generic"));
  const withdraw = () =>
    start(async () => {
      const r = await withdrawEarnings({ amount, method, phone: tel });
      if (r.ok) {
        setSent(true);
        router.refresh();
      } else setMsg({ ok: false, text: error(r.error) });
    });
  const toWallet = () =>
    start(async () => {
      const r = await earningsToWalletAction(String(available / 100));
      setMsg(r.ok ? { ok: true, text: t("walletDone", { amount: fmt(available) }) } : { ok: false, text: error(r.error) });
      router.refresh();
    });
  const pick = (m: "MONCASH" | "NATCASH") => `flex min-h-[52px] items-center justify-center rounded-[14px] ${method === m ? "border-2 border-text" : "border border-border"} keep-white bg-white`;
  return (
    <section className="flex flex-col gap-3 rounded-[18px] border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold text-muted">{t("canWithdraw")}</span>
          <span className="text-[30px] font-extrabold tracking-[-0.5px] text-success">{fmt(available)}</span>
          {pending > 0 && <span className="text-xs text-muted">{t("waiting", { amount: fmt(pending) })}</span>}
        </div>
        <span className="flex flex-col gap-1.5">
          <span className="keep-white rounded-lg border border-border bg-white px-2 py-1"><PayLogo brand="moncash" height={14} /></span>
          <span className="keep-white rounded-lg border border-border bg-white px-2 py-1"><PayLogo brand="natcash" height={14} /></span>
        </span>
      </div>
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <button type="button" disabled={!canWithdraw || pendingTx} onClick={() => { setSheet(true); setSent(false); setMsg(null); }}
          className={`min-h-[50px] rounded-[14px] text-[15px] font-extrabold ${canWithdraw ? "bg-cyan text-white" : "bg-surface-2 text-muted"}`}>{t("withdraw")}</button>
        <button type="button" disabled={available <= 0 || pendingTx} onClick={toWallet} className="min-h-[50px] rounded-[14px] border border-border bg-surface text-[13px] font-bold disabled:opacity-50">{t("toWallet")}</button>
      </div>
      {!canWithdraw && <span className="text-xs font-semibold text-warning">{t("needMore", { amount: fmt(min - available) })}</span>}
      {msg && <span className={`rounded-[10px] px-3 py-2.5 text-[13px] font-semibold ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{msg.text}</span>}
      <span className="text-xs text-muted">{t("minLine", { min: fmt(min) })}</span>

      {sheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-[rgba(15,23,42,0.55)]" onClick={() => setSheet(false)}>
          <div role="dialog" aria-modal="true" aria-label={t("withdraw")} onClick={(e) => e.stopPropagation()}
            className="mx-auto flex w-full max-w-[560px] flex-col gap-3.5 rounded-t-[22px] bg-surface px-5 pb-[calc(24px+env(safe-area-inset-bottom,0px))] pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold">{t("withdraw")}</h2>
              <button type="button" onClick={() => setSheet(false)} aria-label={t("close")} className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
            {sent ? (
              <div className="flex flex-col items-center gap-2.5 py-2 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="5 12 10 17 19 7" /></svg>
                </span>
                <span className="text-[17px] font-extrabold">{t("sentTitle")}</span>
                <span className="text-sm text-muted">{t("sentText", { method: method === "MONCASH" ? "MonCash" : "NatCash", phone: tel })}</span>
                <button type="button" onClick={() => setSheet(false)} className="min-h-[50px] w-full rounded-[14px] bg-text text-[15px] font-extrabold text-surface">OK</button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" aria-pressed={method === "MONCASH"} onClick={() => setMethod("MONCASH")} className={pick("MONCASH")}><PayLogo brand="moncash" height={20} /></button>
                  <button type="button" aria-pressed={method === "NATCASH"} onClick={() => setMethod("NATCASH")} className={pick("NATCASH")}><PayLogo brand="natcash" height={20} /></button>
                </div>
                <label className="flex flex-col gap-1.5 text-[13px] font-bold">{t("amount")}
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="h-[50px] rounded-xl border border-border bg-surface px-3 text-lg font-extrabold" />
                  <span className="text-xs font-normal text-muted">{t("range", { min: fmt(min), max: fmt(available) })}</span>
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] font-bold">{t("number", { method: method === "MONCASH" ? "MonCash" : "NatCash" })}
                  <input value={tel} onChange={(e) => setTel(e.target.value)} type="tel" inputMode="tel" placeholder="+509 …" className="h-[50px] rounded-xl border border-border bg-surface px-3 text-base font-semibold" />
                  <span className="text-xs font-normal text-muted">{t("sameName", { name })}</span>
                </label>
                {msg && !msg.ok && <span className="rounded-[10px] bg-danger-soft px-3 py-2.5 text-[13px] font-semibold text-danger">{msg.text}</span>}
                <button type="button" disabled={pendingTx} onClick={withdraw} className="min-h-[52px] rounded-[14px] bg-cyan text-base font-extrabold text-white">{pendingTx ? "…" : t("send")}</button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** Personal link, a ready-to-send Kreyòl message, WhatsApp / Facebook buttons. */
export function ShareBox({ link, message }: { link: string; message: string }) {
  const t = useTranslations("refUi");
  const enc = encodeURIComponent(message);
  return (
    <section className="flex flex-col gap-2.5">
      <label htmlFor="reflink" className="text-sm font-bold">{t("yourLink")}</label>
      <div className="flex gap-2">
        <input id="reflink" readOnly value={link.replace(/^https?:\/\//, "")} className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-[15px] font-semibold" />
        <CopyButton value={link} label={t("copy")} done={t("copied")} />
      </div>
      <p className="rounded-xl border border-dashed border-border bg-surface p-3 text-[13px] leading-normal text-text/80">{message}</p>
      <div className="grid grid-cols-2 gap-2">
        <a href={`https://wa.me/?text=${enc}`} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#15803D] text-sm font-bold text-white">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.5 8.5 0 1 1 21 11.5z" /></svg>WhatsApp
        </a>
        <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] text-sm font-bold text-white">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg>Facebook
        </a>
      </div>
    </section>
  );
}

type Row = { id: string; initial: string; name: string; meta: string; value: string; tone: "good" | "bad" | "muted" };
const TONE = { good: ["bg-primary-soft text-primary", "text-success"], bad: ["bg-danger-soft text-danger", "text-danger"], muted: ["bg-surface-2 text-muted", "text-muted"] } as const;

/** Two tabs: friends (with what each brought) and past withdrawals. */
export function ReferralLists(p: { friendsLabel: string; payoutsLabel: string; emptyFriends: string; emptyPayouts: string; friends: Row[]; payouts: Row[] }) {
  const [tab, setTab] = useState<"friends" | "payouts">("friends");
  const rows = tab === "friends" ? p.friends : p.payouts;
  const tabCls = (on: boolean) => `min-h-10 rounded-[9px] text-sm font-bold ${on ? "bg-surface text-text shadow-[0_1px_3px_rgba(15,23,42,0.12)]" : "text-muted"}`;
  return (
    <section className="flex flex-col gap-2">
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
        <button type="button" role="tab" aria-selected={tab === "friends"} onClick={() => setTab("friends")} className={tabCls(tab === "friends")}>{p.friendsLabel}</button>
        <button type="button" role="tab" aria-selected={tab === "payouts"} onClick={() => setTab("payouts")} className={tabCls(tab === "payouts")}>{p.payoutsLabel}</button>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-2.5 border-b border-border py-2.5">
          <span className="flex min-w-0 items-center gap-2.5">
            <span className={`grid h-9 w-9 flex-none place-items-center rounded-full text-sm font-extrabold ${TONE[r.tone][0]}`}>{r.initial}</span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold">{r.name}</span>
              <span className="text-xs text-muted">{r.meta}</span>
            </span>
          </span>
          <span className={`flex-none text-sm font-bold ${TONE[r.tone][1]}`}>{r.value}</span>
        </div>
      ))}
      {!rows.length && <p className="py-3 text-center text-sm text-muted">{tab === "friends" ? p.emptyFriends : p.emptyPayouts}</p>}
    </section>
  );
}
