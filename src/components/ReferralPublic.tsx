"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@/lib/money";

/** "How much could I earn": friends × what each spends a month × the tier % those friends reach. An example only. */
export function EarningsCalculator({ tiers }: { tiers: { name: string; pct: number; minActive: number }[] }) {
  const t = useTranslations("refPublic");
  const locale = useLocale();
  const [friends, setFriends] = useState(10);
  const [spend, setSpend] = useState(100_000);
  const tier = [...tiers].reverse().find((x) => friends >= x.minActive) ?? tiers[0];
  const earn = Math.round((friends * spend * (tier?.pct ?? 0)) / 100);
  const fmt = (n: number) => formatMoney(n, "HTG", locale);
  const step = "h-11 w-11 rounded-xl border border-border bg-surface text-xl font-extrabold";
  return (
    <section className="flex flex-col gap-3.5 rounded-[18px] border border-border bg-surface p-4">
      <h2 className="text-lg font-extrabold">{t("calcTitle")}</h2>
      <div className="flex items-center justify-between gap-2.5">
        <span id="cf" className="text-sm font-bold">{t("calcFriends")}</span>
        <div role="group" aria-labelledby="cf" className="flex items-center gap-1.5">
          <button type="button" onClick={() => setFriends((f) => Math.max(1, f - 1))} aria-label={t("less")} className={step}>−</button>
          <span className="min-w-10 text-center text-xl font-extrabold">{friends}</span>
          <button type="button" onClick={() => setFriends((f) => Math.min(100, f + 1))} aria-label={t("more")} className={step}>+</button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold">{t("calcSpend")}</span>
        <div className="grid grid-cols-3 gap-1.5">
          {[50_000, 100_000, 250_000].map((v) => (
            <button key={v} type="button" aria-pressed={spend === v} onClick={() => setSpend(v)}
              className={`min-h-11 rounded-xl text-[13px] font-bold ${spend === v ? "border-2 border-cyan bg-primary-soft text-cyan" : "border border-border bg-surface"}`}>{fmt(v)}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1 rounded-[14px] border border-[#BBF7D0] bg-[#F0FDF4] p-3.5 dark:border-border dark:bg-surface-2">
        <span className="text-[13px] font-bold text-[#166534]">{t("calcResult")}</span>
        <span className="text-[30px] font-extrabold tracking-[-0.5px] text-[#166534]">{fmt(earn)} <span className="text-base">{t("perMonth")}</span></span>
        <span className="text-xs text-[#3F6212] dark:text-muted">{t("calcLine", { n: friends, spend: fmt(spend), pct: tier?.pct ?? 0, tier: tier?.name ?? "" })}</span>
      </div>
      <span className="text-xs text-muted">{t("calcNote")}</span>
    </section>
  );
}

export function RefFaq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState(0);
  return (
    <>
      {items.map((x, i) => (
        <div key={x.q} className="rounded-[14px] border border-border bg-surface">
          <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)} className="flex min-h-[52px] w-full items-center justify-between gap-2.5 px-3.5 py-3 text-left text-sm font-bold">
            <span>{x.q}</span><span aria-hidden className="text-lg text-muted">{open === i ? "−" : "+"}</span>
          </button>
          {open === i && <p className="px-3.5 pb-3.5 text-[13px] leading-normal text-muted">{x.a}</p>}
        </div>
      ))}
    </>
  );
}
