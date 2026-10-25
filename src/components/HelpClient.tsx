"use client";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { lookupOrder } from "@/actions/customer";
import { formatMoney } from "@/lib/money";
import { t as txt } from "@/lib/text";

/** Help page: order lookup by number. */
export function OrderLookup({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("helpUi");
  const to = useTranslations("order");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof lookupOrder>> | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3.5">
      <label htmlFor="lookup" className="text-sm font-bold">{t("lookup")}</label>
      {!signedIn ? (
        <Link href="/auth/login?next=/help" className="text-sm font-semibold text-[#00209F] dark:text-primary">{t("signIn")}</Link>
      ) : (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => setResult(await lookupOrder(Number(q.replace(/\D/g, ""))))); }}>
          <input id="lookup" inputMode="numeric" placeholder={t("lookupPlaceholder")} value={q} onChange={(e) => { setQ(e.target.value); setResult(null); }}
            className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-base" />
          <button disabled={pending || !q.trim()} className="h-12 flex-none rounded-xl bg-text px-4 text-sm font-bold text-surface disabled:opacity-60">{t("search")}</button>
        </form>
      )}
      {result && !result.ok && <p className="text-[13px] text-[#991B1B]">{t("notFound")}</p>}
      {result?.ok && (
        <Link href={`/account/orders/${result.id}`} className="flex flex-col gap-1 rounded-xl bg-[#EFF6FF] p-3 text-text dark:bg-surface-2">
          <span className="text-sm font-bold">#{result.number} · {txt(result.name, locale)}{result.quantity ? ` · ${Number(result.quantity).toLocaleString("en-US")}` : ""}</span>
          <span className="text-[13px] text-[#1E40AF] dark:text-primary">{to(`status.${result.status}`)} · {formatMoney(result.total, "HTG", locale)}</span>
        </Link>
      )}
    </section>
  );
}

/** Help page: questions that open one at a time. */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="flex flex-col gap-2">
      {items.map((f, i) => (
        <div key={f.q} className="rounded-[14px] border border-border bg-surface">
          <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)} className="flex min-h-[50px] w-full items-center justify-between gap-2.5 px-3.5 text-left text-sm font-bold">
            {f.q}
            <span className="text-lg text-[#64748B]" aria-hidden>{open === i ? "−" : "+"}</span>
          </button>
          {open === i && <p className="px-3.5 pb-3.5 text-[13px] leading-normal text-text/80">{f.a}</p>}
        </div>
      ))}
    </div>
  );
}
