import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { t as txt } from "@/lib/text";
import { VIP_LEVELS } from "@/lib/vip";
import { avgText, maxReferralPct, listChoices, listPacks, profitOf, realAverages } from "@/lib/suppliers/catalog";
import { savePackItems, savePricing, setChoicePrice } from "@/actions/catalog";
import { ActionButton, ActionForm } from "@/components/admin/ActionButton";

export const metadata = { title: "Pricing & profit" };

const g = (c: number) => `${c < 0 ? "−" : ""}${Math.abs(Math.round(c / 100)).toLocaleString("en-US")} HTG`;
const card = "rounded-[14px] border border-[#E5E7EF] bg-surface p-[18px] dark:border-border";
const pill = "whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold";
const STATUS = {
  ok: ["OK", "#DCFCE7", "#166534", "#166534"],
  low: ["Low margin", "#FEF3C7", "#92400E", "#B45309"],
  loss: ["Loss", "#FEE2E2", "#991B1B", "#B91C1C"],
  nocost: ["Not linked", "#F1F5F9", "#475569", "#475569"],
} as const;
const input = "h-11 rounded-[10px] border border-[#CBD2E1] bg-surface px-3 text-base font-bold text-text dark:border-border";

/**
 * Pricing, real profit and curated picks (mockup "AdminPricing"): settings that change every row, the real profit
 * per 1,000 of every choice, the three picks of one service with their provider services, starter packs and VIP levels.
 */
export default async function PricingAdmin({ searchParams }: { searchParams: Promise<{ pick?: string }> }) {
  await requireStaff("settings.manage");
  const { pick } = await searchParams;
  const [s, choices, avg] = await Promise.all([getSettings(), listChoices(), realAverages()]);
  const packs = await listPacks(choices);
  const rows = choices.map((c) => ({ c, p: profitOf(c.priceHtg, c.provider ? Number(c.provider.rate) : null, s) }));
  const n = (k: keyof typeof STATUS) => rows.filter((r) => r.p.status === k).length;
  const vipMax = Math.max(...VIP_LEVELS.map((l) => l.discount));
  const refMax = maxReferralPct(s);
  const products = [...new Map(choices.map((c) => [c.product.slug, c.product])).values()];
  const picked = products.find((p) => p.slug === pick) ?? products[0];
  const picks = choices.filter((c) => c.productId === picked?.id);
  const realAvg = (id: string) => {
    const a = avg.get(id);
    return a ? `${avgText(a.minutes).fr} (${a.orders} order${a.orders > 1 ? "s" : ""})` : null;
  };

  return (
    <div className="flex flex-col gap-[22px]">
      <div>
        <h1 className="text-2xl font-extrabold">Pricing, real profit and curated picks</h1>
        <p className="mt-1 text-[13px] text-muted">Change a value and save: every row recalculates, and choices that lose money pause by themselves.</p>
      </div>

      <ActionForm action={savePricing} className={`${card} grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]`}>
        {[
          ["htgPerUsd", "Exchange rate (HTG per $1)", s.htgPerUsd, "Provider prices are in dollars"],
          ["paymentFeePct", "Payment fee %", s.paymentFeePct, "MonCash / NatCash"],
          ["minProfitPct", "Minimum profit %", s.minProfitPct, "Below = warning"],
          ["targetProfitPct", "Target profit %", s.targetProfitPct, "Used for suggested prices"],
        ].map(([name, label, value, hint]) => (
          <label key={name as string} className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-muted">{label}</span>
            <input name={name as string} defaultValue={String(value)} inputMode="decimal" className={input} />
            <span className="text-[11px] text-[#64748B]">{hint}</span>
          </label>
        ))}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-muted">Losing money</span>
          <span className="flex h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" name="autoPauseLoss" defaultChecked={s.autoPauseLoss} className="h-5 w-5" /> Pause automatically</span>
          <span className="text-[11px] text-[#64748B]">Back on when fixed</span>
        </label>
        <div className="flex flex-col justify-center"><button className="h-11 rounded-[10px] bg-[#00209F] px-4 text-sm font-bold text-white">Save</button></div>
      </ActionForm>

      <section className={`${card} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">Real profit per 1,000 (worst case: Diamond customer, referred by a top-tier friend, + payment fee)</h2>
          <span className="text-xs text-muted">{n("ok")} OK · {n("low")} low margin · {n("loss")} losing{s.autoPauseLoss ? " (paused)" : ""} · {n("nocost")} not linked</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[13px]">
            <thead>
              <tr className="text-right text-xs text-muted">
                <th className="px-1.5 py-2 text-left font-bold">Service</th>
                <th className="px-1.5 py-2 font-bold">Provider cost</th>
                <th className="px-1.5 py-2 font-bold">= in HTG</th>
                <th className="px-1.5 py-2 font-bold">Selling price</th>
                <th className="px-1.5 py-2 font-bold">VIP −{vipMax}%</th>
                <th className="px-1.5 py-2 font-bold">Referral {refMax}%</th>
                <th className="px-1.5 py-2 font-bold">Pay fee</th>
                <th className="px-1.5 py-2 font-bold">Real profit</th>
                <th className="px-1.5 py-2 text-left font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, p }) => {
                const st = STATUS[p.status];
                return (
                  <tr key={c.id} className="border-t border-[#EEF0F5] text-right dark:border-border">
                    <td className="px-1.5 py-[11px] text-left font-bold">{txt(c.product.name, "ht")} · {txt(c.name, "ht")}{!c.isActive && <span className="ml-1.5 text-[11px] font-semibold text-muted">OFF</span>}</td>
                    <td className="px-1.5 py-[11px] tabular-nums text-muted">{c.provider ? `$${Number(c.provider.rate).toFixed(2)}` : "—"}</td>
                    <td className="px-1.5 py-[11px] tabular-nums">{c.provider ? g(p.costHtg) : "—"}</td>
                    <td className="px-1.5 py-[11px]">
                      <ActionButton label={g(p.sell)} prompt={`New selling price per 1,000 in gourdes (now ${(p.sell / 100).toLocaleString("en-US")})`} className="rounded-md px-1 font-bold tabular-nums underline decoration-dotted underline-offset-4 hover:text-[#00209F]" action={setChoicePrice.bind(null, c.id)} />
                    </td>
                    <td className="px-1.5 py-[11px] tabular-nums text-muted">−{g(p.vip)}</td>
                    <td className="px-1.5 py-[11px] tabular-nums text-muted">−{g(p.ref)}</td>
                    <td className="px-1.5 py-[11px] tabular-nums text-muted">−{g(p.fee)}</td>
                    <td className="px-1.5 py-[11px] font-extrabold tabular-nums" style={{ color: st[3] }}>{p.status === "nocost" ? "—" : `${g(p.profit)} (${Math.round(p.pct)}%)`}</td>
                    <td className="px-1.5 py-[11px] text-left"><span className={pill} style={{ background: st[1], color: st[2] }}>{p.status === "loss" && c.meta.pausedLoss ? "Loss: auto-paused" : st[0]}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">Tap a selling price to change it. The referral column is the highest tier&apos;s commission; there is no top-up bonus.</p>
      </section>

      <section className="flex flex-wrap gap-4">
        <div className={`${card} flex min-w-0 flex-[2_1_460px] flex-col gap-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold">Curated picks · {picked ? txt(picked.name, "ht") : "—"}</h2>
            <form className="flex gap-2">
              <select name="pick" defaultValue={picked?.slug} className="h-9 rounded-[10px] border border-[#CBD2E1] bg-surface px-2 text-[13px] dark:border-border" aria-label="Service">
                {products.map((p) => <option key={p.slug} value={p.slug}>{txt(p.name, "ht")}</option>)}
              </select>
              <button className="h-9 rounded-[10px] border border-[#CBD2E1] bg-surface px-3 text-[13px] font-bold dark:border-border">Show</button>
            </form>
          </div>
          <p className="text-xs text-muted">Customers see only these {picks.length} choices. Each points to a provider service, with a backup used only if the first one refuses the order.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-xs text-muted">
                  {["Shown as", "Main provider service", "Backup", "Real avg time"].map((h) => <th key={h} className="px-1.5 py-2 font-bold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {picks.map((c) => (
                  <tr key={c.id} className="border-t border-[#EEF0F5] dark:border-border">
                    <td className="px-1.5 py-[11px] font-extrabold">{txt(c.name, "ht")}</td>
                    <td className="px-1.5 py-[11px]">{c.provider ? `${c.supplier?.name} · #${c.provider.serviceId} ${c.provider.name}` : <span className="text-muted">Not linked (manual)</span>}</td>
                    <td className="px-1.5 py-[11px] text-muted">{c.backup ? `${c.backupSupplier?.name} · #${c.backup.serviceId}` : "—"}</td>
                    <td className="px-1.5 py-[11px]">{realAvg(c.id) ?? <span className="text-muted">{txt(c.meta.avg, "fr")} (set by hand)</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link href={`/admin/services#${picked?.slug ?? ""}`} className="self-start rounded-[10px] border border-[#CBD2E1] bg-surface px-3 py-2 text-[13px] font-bold text-text dark:border-border">Edit picks</Link>
        </div>

        <div className={`${card} flex min-w-0 flex-[1_1_300px] flex-col gap-3`}>
          <h2 className="text-base font-bold">Starter packs</h2>
          {packs.map((k) => (
            <div key={k.v.id} className="flex flex-col gap-1 rounded-xl border border-[#E5E7EF] p-3 dark:border-border">
              <div className="flex justify-between text-sm font-extrabold"><span>{txt(k.v.product.name, "ht")}</span><span>{g(k.price)}</span></div>
              <div className="text-xs text-muted">
                {k.items.length ? k.items.map((i) => `${i.quantity.toLocaleString("en-US")} ${i.choice ? txt(i.choice.product.name, "ht").replace(/^\S+\s/, "").toLowerCase() : "?"}`).join(" + ") : "Contents not set"}
                {k.separate > k.price ? ` · −${Math.round((1 - k.price / k.separate) * 100)}%` : ""}
              </div>
              <div className="text-xs font-bold" style={{ color: STATUS[k.profit.status][3] }}>
                {k.profit.status === "nocost" ? "Real profit: link every service in it to see it" : `Real profit: ${g(k.profit.profit)} (${Math.round(k.profit.pct)}%)`}
              </div>
              <details className="mt-1">
                <summary className="cursor-pointer text-xs font-semibold text-[#00209F] dark:text-primary">Edit contents</summary>
                <ActionForm action={savePackItems.bind(null, k.v.id)} className="mt-2 space-y-1.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex gap-1.5">
                      <select name={`v${i}`} defaultValue={k.items[i]?.variantId ?? ""} className="h-9 min-w-0 flex-1 rounded-lg border border-[#CBD2E1] bg-surface px-1.5 text-xs dark:border-border">
                        <option value="">—</option>
                        {choices.map((c) => <option key={c.id} value={c.id}>{txt(c.product.name, "ht")} · {txt(c.name, "ht")}</option>)}
                      </select>
                      <input name={`q${i}`} defaultValue={k.items[i]?.quantity ?? ""} inputMode="numeric" placeholder="Qty" className="h-9 w-20 rounded-lg border border-[#CBD2E1] bg-surface px-2 text-xs dark:border-border" />
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <label className="text-[11px] font-bold text-muted">Pack discount %<input name="discountPct" defaultValue={k.config.discountPct} inputMode="numeric" className="mt-0.5 h-9 w-full rounded-lg border border-[#CBD2E1] bg-surface px-2 text-xs dark:border-border" /></label>
                    <label className="text-[11px] font-bold text-muted">Max videos<input name="maxVideos" defaultValue={k.config.maxVideos} inputMode="numeric" className="mt-0.5 h-9 w-full rounded-lg border border-[#CBD2E1] bg-surface px-2 text-xs dark:border-border" /></label>
                  </div>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="newOnly" defaultChecked={k.config.newOnly} /> New customers only (first order)</label>
                  <p className="text-[11px] text-muted">The price is always the choices&apos; prices minus the pack discount; likes and views are spread over the customer&apos;s videos (up to the max).</p>
                  <button className="h-9 rounded-lg bg-[#00209F] px-3 text-xs font-bold text-white">Save contents</button>
                </ActionForm>
              </details>
            </div>
          ))}
          {!packs.length && <p className="text-sm text-muted">No packs yet.</p>}
          <h2 className="mt-1.5 text-base font-bold">VIP levels</h2>
          <p className="text-[13px] leading-[1.7] text-[#334155] dark:text-muted">
            {VIP_LEVELS.map((l, i) => (
              <span key={l.key}>
                {i > 0 && " · "}
                {i === 0 ? l.name.ht : <b>{l.name.ht}</b>} {l.discount ? `-${l.discount}%` : "0%"}
                {l.min ? ` (${g(l.min)})` : ""}
              </span>
            ))}
          </p>
        </div>
      </section>
    </div>
  );
}
