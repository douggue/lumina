import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { t as txt } from "@/lib/text";
import { analyzeRisk, rulesToText, type RiskLevel } from "@/lib/service-risk";
import { learnedSuggestions, listChoices, suggestRisk } from "@/lib/suppliers/catalog";
import { decideLearned, deleteUpdate, linkChoiceAction, postUpdateNote, saveChoiceDetails, reanalyzeAction, saveRiskRules, saveServiceStatus, setRiskAction, syncProvidersAction, toggleRiskLock } from "@/actions/catalog";
import { ActionButton, ActionForm } from "@/components/admin/ActionButton";
import { NewServiceBuilder, ProviderPicker } from "@/components/admin/ProviderPicker";
import { PLATFORMS } from "@/lib/services";

export const metadata = { title: "Services & risk" };

const BADGE: Record<RiskLevel, [string, string, string]> = {
  low: ["Low", "#DCFCE7", "#166534"],
  med: ["Medium", "#FEF3C7", "#92400E"],
  high: ["High", "#FEE2E2", "#991B1B"],
  blocked: ["Blocked", "#0F172A", "#FFFFFF"],
};
const Badge = ({ level }: { level: RiskLevel }) => (
  <span className="inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: BADGE[level][1], color: BADGE[level][2] }}>{BADGE[level][0]}</span>
);
const chip = (w: string) => `rounded-md px-[7px] py-[3px] font-mono text-[11px] font-bold ${w.startsWith("+") ? "bg-[#FEE2E2] text-[#991B1B]" : w.startsWith("−") ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#F1F5F9] text-[#475569]"}`;
/** Rule words as people read them: "speed:fast" → "10K+/day", "kind:views" → "kind: views". */
const readable = (w: string) => (w === "speed:fast" ? "10K+/day" : w === "speed:slow" ? "slow speed (under 1K/day)" : w.startsWith("kind:") ? `kind: ${w.slice(5)}` : w);
const card = "rounded-[14px] border border-[#E5E7EF] bg-surface p-[18px] dark:border-border";
const btn = "inline-flex min-h-10 items-center rounded-[10px] border border-[#CBD2E1] bg-surface px-3.5 text-[13px] font-bold text-text dark:border-border";
const field = "h-9 rounded-lg border border-[#CBD2E1] bg-surface px-2 text-xs dark:border-border";

/**
 * Services · risk analysis (mockup "AdminServices"): the level suggested from the provider's own words, why,
 * staff's final level and lock, editable clue rules, suggestions learned from real orders, blocked categories,
 * plus what this site needs around it: the provider link of each choice, services status, and a provider search.
 */
export default async function ServicesAdmin({ searchParams }: { searchParams: Promise<{ q?: string; p?: string }> }) {
  await requireStaff("catalog.manage");
  const { q = "", p = "" } = await searchParams;
  const [settings, choices, suppliers, known, learned] = await Promise.all([
    getSettings(),
    listChoices(),
    prisma.supplier.findMany({ where: { preset: { in: ["smm_panel", "smm_mock"] } }, orderBy: { createdAt: "asc" } }),
    prisma.providerService.findMany({ where: { removedAt: null }, select: { name: true, desc: true, category: true, supplierId: true, seenAt: true } }),
    learnedSuggestions().catch(() => []),
  ]);
  const updates = await prisma.serviceUpdate.findMany({ orderBy: { createdAt: "desc" }, take: 15 });
  const allPlatforms = await prisma.category.findMany({ where: { slug: { in: Object.keys(PLATFORMS) } }, orderBy: { sortOrder: "asc" } });
  // Counts over every provider service we know (like the mockup's real test), then over what's on sale.
  const tally: Record<RiskLevel, number> = { low: 0, med: 0, high: 0, blocked: 0 };
  for (const x of known) tally[analyzeRisk(x, settings.riskRules, settings.riskBlocked).level]++;
  const lastSync = known.reduce<Date | null>((a, x) => (!a || x.seenAt > a ? x.seenAt : a), null);
  const rows = choices.map((c) => ({ c, s: suggestRisk(c, settings), level: (c.meta.blocked ? "blocked" : c.meta.risk) as RiskLevel }));
  const onSale = (l: RiskLevel) => rows.filter((r) => r.level === l).length;
  const platforms = [...new Map(choices.map((c) => [c.product.category.slug, c.product.category])).values()];
  const search = q.trim()
    ? await prisma.providerService.findMany({
        where: { removedAt: null, ...(p ? { supplierId: p } : {}), OR: [{ name: { contains: q.trim(), mode: "insensitive" } }, { category: { contains: q.trim(), mode: "insensitive" } }, { serviceId: q.trim() }] },
        include: { supplier: { select: { name: true } } },
        orderBy: { rate: "asc" },
        take: 60,
      })
    : [];

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Services · risk analysis</h1>
          <p className="mt-1 text-[13px] text-muted">Levels are suggested from the provider&apos;s own words. You have the final say.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton label="Sync from providers" className={btn} action={syncProvidersAction.bind(null, null)} />
          <ActionButton label="Re-analyze all" className={btn} action={reanalyzeAction} />
        </div>
      </div>

      <section className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
        {(["low", "med", "high", "blocked"] as const).map((l) => (
          <div key={l} className="flex flex-col gap-2 rounded-[14px] border border-[#E5E7EF] bg-surface p-4 dark:border-border">
            <span><Badge level={l} /></span>
            <span className="text-[26px] font-extrabold tabular-nums">{known.length ? tally[l].toLocaleString("en-US") : "—"}</span>
            <span className="text-xs text-muted">{onSale(l)} on sale here</span>
          </div>
        ))}
      </section>
      <p className="-mt-3 text-xs text-muted">
        {known.length ? `Counts from ${known.length.toLocaleString("en-US")} provider services, analyzed ${lastSync?.toLocaleDateString("en-CA") ?? ""}.` : "No provider services yet: add an SMM provider in Providers, then press Sync."}
      </p>

      <section className={`${card} flex flex-col gap-3`}>
        <h2 className="text-base font-bold">Services</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-xs text-muted">
                {["Provider service (name as given by provider)", "Suggested", "Why", "Your level", "Lock"].map((h) => <th key={h} className="px-1.5 py-2 font-bold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, s, level }) => (
                <tr key={c.id} id={c.product.slug} className="border-t border-[#EEF0F5] align-top dark:border-border">
                  <td className="max-w-[360px] px-1.5 py-3">
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#00209F] dark:text-primary">
                      {txt(c.product.name, "ht")} · {txt(c.name, "ht")}
                      {!c.isActive && <span className="ml-1.5 rounded bg-[#F1F5F9] px-1 text-[#475569]">OFF{c.meta.pausedLoss ? " · loss" : c.meta.blocked ? " · blocked" : ""}</span>}
                    </span>
                    {c.provider ? (
                      <>
                        <span className="block font-bold">{c.provider.name}</span>
                        <span className="block text-xs text-muted">{c.provider.desc || c.provider.category} · {c.supplier?.name} #{c.provider.serviceId} · ${Number(c.provider.rate).toFixed(2)}/1K{c.provider.removedAt ? " · GONE from provider" : ""}</span>
                        {c.backup && <span className="block text-xs text-muted">Backup: {c.backupSupplier?.name} #{c.backup.serviceId}</span>}
                      </>
                    ) : (
                      <span className="block text-xs text-muted">Not linked yet{c.meta.desc ? ` · own text: ${c.meta.desc}` : ""}</span>
                    )}
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-xs font-semibold text-[#00209F] dark:text-primary">{c.provider ? "Change provider service" : "Link a provider service"}</summary>
                      <ProviderPicker variantId={c.id} />
                      <p className="mt-2 text-[11px] font-bold text-muted">Or type the service id</p>
                      <ActionForm action={linkChoiceAction.bind(null, c.id)} className="mt-1 grid gap-1.5 sm:grid-cols-2">
                        <select name="supplierId" defaultValue={c.supplierId ?? ""} className={field} aria-label="Provider">
                          <option value="">— none —</option>
                          {suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                        <input name="sku" defaultValue={c.supplierSku ?? ""} placeholder={c.meta.type === "live" ? "15=201,30=202,60=203" : "Service id, e.g. 1234"} className={`${field} font-mono`} aria-label="Service id" />
                        <select name="backupSupplierId" defaultValue={c.backupSupplierId ?? ""} className={field} aria-label="Backup provider">
                          <option value="">Backup: none</option>
                          {suppliers.map((x) => <option key={x.id} value={x.id}>Backup: {x.name}</option>)}
                        </select>
                        <input name="backupSku" defaultValue={c.backupSupplierSku ?? ""} placeholder="Backup service id" className={`${field} font-mono`} aria-label="Backup service id" />
                        <button className="h-9 rounded-lg bg-[#00209F] px-3 text-xs font-bold text-white sm:col-span-2">Save link</button>
                      </ActionForm>
                    </details>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs font-semibold text-[#00209F] dark:text-primary">Customer details (what customers see)</summary>
                      <ActionForm action={saveChoiceDetails.bind(null, c.id)} className="mt-2 grid gap-1.5 sm:grid-cols-2">
                        <label className="text-[11px] font-bold text-muted sm:col-span-2">Short description · Kreyòl
                          <textarea name="about_ht" rows={2} defaultValue={c.meta.about?.ht ?? ""} className={`${field} mt-0.5 h-auto w-full py-1.5`} placeholder="Abòne reyèl, yo rive vit, refill 30 jou." />
                        </label>
                        <label className="text-[11px] font-bold text-muted sm:col-span-2">Short description · Français
                          <textarea name="about_fr" rows={2} defaultValue={c.meta.about?.fr ?? ""} className={`${field} mt-0.5 h-auto w-full py-1.5`} />
                        </label>
                        <select name="quality" defaultValue={c.meta.info?.quality ?? ""} className={field} aria-label="Quality">
                          <option value="">Quality: not shown</option><option value="real">Real</option><option value="mixed">Real + mixed</option><option value="hq">High quality</option><option value="bot">Bot</option>
                        </select>
                        <select name="drop" defaultValue={c.meta.info?.drop ?? ""} className={field} aria-label="Drop">
                          <option value="">Drop: not shown</option><option value="none">Non drop</option><option value="low">Low drop</option><option value="yes">Can drop</option>
                        </select>
                        <input name="speed" defaultValue={c.meta.info?.speed ?? ""} placeholder="Speed per day, e.g. 300K" className={field} aria-label="Speed per day" />
                        <input name="start" defaultValue={c.meta.info?.start ?? ""} placeholder="Start: instant, 0-5 min, 12-24 h" className={field} aria-label="Start time" />
                        <input name="location" defaultValue={c.meta.info?.location ?? ""} placeholder="Location: Global, USA…" className={field} aria-label="Location" />
                        <select name="cancel" defaultValue={c.meta.info?.cancel === true ? "yes" : c.meta.info?.cancel === false ? "no" : ""} className={field} aria-label="Cancel button">
                          <option value="">Cancel button: not shown</option><option value="yes">Cancel button: yes</option><option value="no">Cancel button: no</option>
                        </select>
                        <select name="postType" defaultValue={c.meta.postType ?? ""} className={field} aria-label="Post type">
                          <option value="">Posts accepted: any</option><option value="reel">Instagram reels only</option><option value="shorts">YouTube Shorts only</option><option value="video">Normal videos only (no Shorts/reels)</option>
                        </select>
                        <input name="refillDays" defaultValue={c.meta.refillDays} inputMode="numeric" placeholder="Refill days (0 = none)" className={field} aria-label="Refill days" />
                        <input name="avg_ht" defaultValue={c.meta.avg.ht ?? ""} placeholder="Average time · Kreyòl" className={field} aria-label="Average time Kreyòl" />
                        <input name="avg_fr" defaultValue={c.meta.avg.fr ?? ""} placeholder="Average time · Français" className={field} aria-label="Average time French" />
                        <button className="h-9 rounded-lg bg-[#00209F] px-3 text-xs font-bold text-white sm:col-span-2">Save customer details</button>
                      </ActionForm>
                    </details>
                  </td>
                  <td className="px-1.5 py-3"><Badge level={s.level} /><span className="mt-1 block text-[11px] text-muted">score {s.level === "blocked" ? "—" : s.score > 0 ? `+${s.score}` : s.score === 0 ? "0" : `−${-s.score}`}</span></td>
                  <td className="px-1.5 py-3"><span className="flex max-w-[260px] flex-wrap gap-1">{s.why.map((w) => <span key={w} className={chip(w)}>{w.replace(/(speed:fast|speed:slow|kind:\w+)/, (m) => readable(m))}</span>)}</span></td>
                  <td className="px-1.5 py-3">
                    <ActionForm action={setRiskAction.bind(null, c.id)} className="flex items-center gap-1.5">
                      <select name="level" defaultValue={c.meta.riskLocked ? level : "auto"} className="h-[38px] rounded-lg border border-[#CBD2E1] bg-surface px-2 text-[13px] dark:border-border" aria-label={`Your level for ${txt(c.name, "ht")}`}>
                        <option value="auto">Use suggestion</option>
                        <option value="low">Low risk</option>
                        <option value="med">Medium risk</option>
                        <option value="high">High risk</option>
                        <option value="blocked">Blocked (never sell)</option>
                      </select>
                      <button className="h-[38px] rounded-lg border border-[#CBD2E1] px-2.5 text-xs font-bold dark:border-border">Save</button>
                    </ActionForm>
                    {c.meta.riskLocked && <span className="mt-1 block text-[11px] font-bold text-[#00209F] dark:text-primary">Changed by you · {BADGE[level][0]}</span>}
                  </td>
                  <td className="px-1.5 py-3">
                    <ActionButton
                      label={c.meta.riskLocked ? "🔒 Locked" : "🔓 Lock"}
                      className={`flex min-h-[38px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold ${c.meta.riskLocked ? "border border-[#0F172A] bg-[#0F172A] text-white" : "border border-[#CBD2E1] bg-surface text-[#334155] dark:border-border dark:text-text"}`}
                      action={toggleRiskLock.bind(null, c.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-wrap gap-4">
        <div className={`${card} flex min-w-0 flex-[1_1_380px] flex-col gap-3`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">Clue rules (editable)</h2>
          </div>
          <p className="text-xs text-muted">Score ≤ −2 = Low · −1 to +1 = Medium · ≥ +2 = High</p>
          <ul className="flex flex-col">
            {settings.riskRules.map((r) => {
              const pts = `${r.points > 0 ? "+" : "−"}${Math.abs(r.points)}`;
              return (
                <li key={r.words.join()} className="flex items-center justify-between gap-3 border-t border-[#EEF0F5] py-2 text-[13px] first:border-t-0 dark:border-border">
                  <span>{r.words.map(readable).join(", ")}</span>
                  <span className={`min-w-[34px] rounded-md px-2 py-1 text-center font-mono text-xs font-extrabold ${r.points > 0 ? "bg-[#FEE2E2] text-[#991B1B]" : "bg-[#DCFCE7] text-[#166534]"}`}>{pts}</span>
                </li>
              );
            })}
          </ul>
          <details>
            <summary className="inline-flex cursor-pointer rounded-[10px] border border-[#CBD2E1] px-3 py-2 text-[13px] font-bold dark:border-border">Edit rules · + Add rule</summary>
            <ActionForm action={saveRiskRules} className="mt-3 space-y-3">
              <p className="text-xs text-muted">One rule per line: points, then the words. &quot;kind:followers&quot; matches the service kind; &quot;speed:fast&quot; = 10K+ a day, &quot;speed:slow&quot; = under 1K a day. Longer words are matched first, so &quot;no refill&quot; is not also counted as &quot;refill&quot;.</p>
              <textarea name="rules" rows={14} defaultValue={rulesToText(settings.riskRules)} className="input font-mono text-xs" spellCheck={false} />
              <label className="block">
                <span className="label">Blocked categories (one per line: never sold)</span>
                <textarea name="blocked" rows={5} defaultValue={settings.riskBlocked.join("\n")} className="input font-mono text-xs" spellCheck={false} />
              </label>
              <button className="h-10 rounded-[10px] bg-[#00209F] px-4 text-sm font-bold text-white">Save rules and re-analyze</button>
            </ActionForm>
          </details>
        </div>

        <div className={`${card} flex min-w-0 flex-[1_1_320px] flex-col gap-3`}>
          <h2 className="text-base font-bold">Learned from real orders</h2>
          {learned.map((l) => (
            <div key={l.choice.id} className="flex flex-col gap-2 rounded-xl bg-[#FEF3C7] p-3 text-[#78350F]">
              <span className="text-[13px] font-bold">{l.choice.provider?.name ?? `${txt(l.choice.product.name, "ht")} · ${txt(l.choice.name, "ht")}`}</span>
              <span className="text-xs">{l.text}</span>
              <span className="flex gap-2">
                <ActionButton label="Accept" className="min-h-9 rounded-lg bg-[#0F172A] px-3 text-xs font-bold text-white" action={decideLearned.bind(null, l.choice.id, true, l.to)} />
                <ActionButton label="Ignore" className="min-h-9 rounded-lg border border-[#D97706] px-3 text-xs font-bold" action={decideLearned.bind(null, l.choice.id, false, l.to)} />
              </span>
            </div>
          ))}
          {!learned.length && <p className="text-[13px] text-muted">Nothing to suggest. Once a service has 10+ orders in a month, you&apos;ll see a suggestion here if 15% need a refill or 20% end partly delivered.</p>}

          <h2 className="mt-1 text-base font-bold">Blocked categories</h2>
          <div className="flex flex-wrap gap-1.5">
            {settings.riskBlocked.map((b) => <span key={b} className="rounded-full bg-[#0F172A] px-2.5 py-1 text-xs font-bold capitalize text-white">{b}</span>)}
          </div>

          <h2 className="mt-1 text-base font-bold">Services status (shown to customers)</h2>
          <p className="text-xs text-muted">Slow = a notice on the home and help pages. Paused = also no new orders.</p>
          <ActionForm action={saveServiceStatus} className="space-y-2">
            {platforms.map((pl) => (
              <label key={pl.slug} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold">{txt(pl.name, "fr")}</span>
                <select name={`status_${pl.slug}`} defaultValue={settings.serviceStatus[pl.slug] ?? "ok"} className={field}>
                  <option value="ok">Normal</option>
                  <option value="slow">Slow</option>
                  <option value="pause">Paused</option>
                </select>
              </label>
            ))}
            <button className="h-10 rounded-[10px] bg-[#00209F] px-4 text-sm font-bold text-white">Save status</button>
          </ActionForm>
        </div>
      </section>

      <section className={`${card} flex flex-col gap-3`}>
        <h2 className="text-base font-bold">Add a new service in one go</h2>
        <p className="text-xs text-muted">Pick the platform and the kind, then one provider service for each choice. The details, limits, risk level and a selling price (for {settings.targetProfitPct}% real profit) are filled in for you; change them afterwards if you want.</p>
        <NewServiceBuilder platforms={allPlatforms.map((c) => ({ slug: c.slug, name: txt(c.name, "fr") }))} />
      </section>

      <section className={`${card} flex flex-col gap-3`}>
        <h2 className="text-base font-bold">Service updates (customers see them on the order screen)</h2>
        <p className="text-xs text-muted">Written automatically for new services, price changes and pauses. Add your own note here.</p>
        <ActionForm action={postUpdateNote} resetOnSuccess className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input name="ht" placeholder="Nòt an Kreyòl" className="h-10 rounded-[10px] border border-[#CBD2E1] bg-surface px-3 text-sm dark:border-border" aria-label="Note in Kreyòl" />
          <input name="fr" placeholder="Note en français (optionnel)" className="h-10 rounded-[10px] border border-[#CBD2E1] bg-surface px-3 text-sm dark:border-border" aria-label="Note in French" />
          <button className="h-10 rounded-[10px] bg-[#00209F] px-4 text-sm font-bold text-white">Post</button>
        </ActionForm>
        <ul className="divide-y divide-[#EEF0F5] dark:divide-border">
          {updates.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span><span className="mr-2 rounded bg-[#F1F5F9] px-1.5 text-[11px] font-bold uppercase text-[#475569]">{u.kind}</span>{txt(u.text, "ht")}<span className="ml-2 text-xs text-muted">{u.createdAt.toLocaleDateString("en-CA")}</span></span>
              <ActionButton label="Remove" className="text-xs font-bold text-danger" action={deleteUpdate.bind(null, u.id)} />
            </li>
          ))}
          {!updates.length && <li className="py-2 text-sm text-muted">No updates yet.</li>}
        </ul>
      </section>

      <section className={`${card} flex flex-col gap-3`}>
        <h2 className="text-base font-bold">Find a provider service</h2>
        <form className="flex flex-wrap gap-2">
          <input name="q" defaultValue={q} placeholder="tiktok followers, refill, 1234…" className="h-10 min-w-0 flex-1 rounded-[10px] border border-[#CBD2E1] bg-surface px-3 text-sm dark:border-border" />
          <select name="p" defaultValue={p} className="h-10 rounded-[10px] border border-[#CBD2E1] bg-surface px-2 text-sm dark:border-border">
            <option value="">All providers</option>
            {suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <button className={btn}>Search</button>
        </form>
        {q && !search.length && <p className="text-sm text-muted">Nothing found. Did you press Sync?</p>}
        <ul className="divide-y divide-[#EEF0F5] dark:divide-border">
          {search.map((x) => {
            const r = analyzeRisk({ name: x.name, desc: x.desc, category: x.category, kind: null }, settings.riskRules, settings.riskBlocked);
            return (
              <li key={x.id} className="flex items-start justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block text-sm">{x.name}</span>
                  <span className="block text-xs text-muted">{x.supplier.name} · <b className="font-mono">#{x.serviceId}</b> · {x.category} · ${Number(x.rate).toFixed(3)}/1K · {x.min.toLocaleString("en-US")}–{x.max.toLocaleString("en-US")}{x.refill ? " · refill" : ""}{x.dripfeed ? " · drip" : ""}</span>
                </span>
                <Badge level={r.level} />
              </li>
            );
          })}
        </ul>
        {!suppliers.length && (
          <p className="text-sm text-muted">No SMM provider yet. <Link href="/admin/suppliers" className="font-semibold text-[#00209F]">Add one</Link> (type &quot;SMM panel&quot;), then press Sync.</p>
        )}
      </section>
    </div>
  );
}
