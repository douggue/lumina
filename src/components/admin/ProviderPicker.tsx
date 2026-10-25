"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createServiceAction, pickProviderAction, providerCandidates } from "@/actions/catalog";
import type { Candidate } from "@/lib/suppliers/catalog";

const LEVEL: Record<string, [string, string, string]> = {
  low: ["Low", "#DCFCE7", "#166534"],
  med: ["Medium", "#FEF3C7", "#92400E"],
  high: ["High", "#FEE2E2", "#991B1B"],
};
const BADGE: Record<string, string> = { cheapest: "Cheapest", fastest: "Fastest", refill: "Refill", safest: "Lowest risk" };
const htg = (c: number) => `${Math.round(c / 100).toLocaleString("en-US")} HTG`;
const input = "h-9 rounded-lg border border-[#CBD2E1] bg-surface px-2 text-xs dark:border-border";

type Query = { variantId?: string; platform?: string; kind?: string; tier?: number };

/** Search box + list of provider service cards (best first for the tier), shared by "link a choice" and "new service". */
function CandidateList({ query, children }: { query: Query; children: (c: Candidate) => React.ReactNode }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Candidate[] | null>(null);
  const [error, setError] = useState("");
  const [loading, start] = useTransition();
  const load = (text: string) =>
    start(async () => {
      const r = await providerCandidates({ ...query, q: text });
      if (r.ok) {
        setList(r.list);
        setError("");
      } else setError(r.error);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => load(""), [query.variantId, query.platform, query.kind, query.tier]);
  return (
    <div className="flex flex-col gap-2">
      <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); load(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all providers: name, category or service id…" className={`${input} min-w-0 flex-1`} aria-label="Search provider services" />
        <button className="h-9 rounded-lg border border-[#CBD2E1] px-3 text-xs font-bold dark:border-border">{loading ? "…" : "Search"}</button>
      </form>
      {error && <p className="text-xs text-danger">{error}</p>}
      {list && !list.length && <p className="text-xs text-muted">No matching provider service. Press &quot;Sync from providers&quot;, or search with other words.</p>}
      <ul className="flex flex-col gap-1.5">
        {list?.map((c) => {
          const lv = LEVEL[c.level] ?? LEVEL.med;
          return (
            <li key={c.id} className="rounded-xl border border-[#E5E7EF] p-2.5 dark:border-border">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold leading-snug">{c.name}</span>
                  <span className="block text-[11px] text-muted">{c.supplierName} · #{c.serviceId} · {c.category}</span>
                </span>
                <span className="flex-none rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: lv[1], color: lv[2] }}>{lv[0]}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                <span><b>${c.rateUsd.toFixed(3)}</b>/1K = {htg(c.costHtg)}</span>
                <span>Suggested price <b>{htg(c.suggestedPrice)}</b></span>
                <span>{c.min.toLocaleString("en-US")}–{c.max.toLocaleString("en-US")}</span>
                {c.speed && <span>{c.speed}/day</span>}
                {c.start && <span>start {c.start}</span>}
                <span>{c.refill ? "refill" : "no refill"}{c.cancel ? " · cancel" : ""}{c.dripfeed ? " · drip" : ""}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {c.badges.map((b) => <span key={b} className="rounded-md bg-[#EEF1FF] px-1.5 py-0.5 text-[10px] font-bold text-[#00209F] dark:bg-surface-2 dark:text-primary">{BADGE[b] ?? b}</span>)}
                <span className="flex-1" />
                {children(c)}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Services & risk, per choice: pick its main (and backup) provider service from cards, with the suggested price. */
export function ProviderPicker({ variantId }: { variantId: string }) {
  const router = useRouter();
  const [setPrice, setSetPrice] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const pick = (id: string, role: "main" | "backup") =>
    start(async () => {
      const r = await pickProviderAction(variantId, id, role, setPrice);
      setMsg(r.ok ? { ok: true, text: r.message ?? "Saved" } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  return (
    <div className="mt-2 flex flex-col gap-2">
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={setPrice} onChange={() => setSetPrice((v) => !v)} /> Also set the suggested selling price</label>
      {msg && <p className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
      <CandidateList query={{ variantId }}>
        {(c) => (
          <>
            <button type="button" disabled={pending} onClick={() => pick(c.id, "main")} className="h-8 rounded-lg bg-[#00209F] px-2.5 text-[11px] font-bold text-white">Use as main</button>
            <button type="button" disabled={pending} onClick={() => pick(c.id, "backup")} className="h-8 rounded-lg border border-[#CBD2E1] px-2.5 text-[11px] font-bold dark:border-border">Backup</button>
          </>
        )}
      </CandidateList>
    </div>
  );
}

const TIERS = ["Bon mache (cheapest)", "Pi bon kalite (refill, low risk)", "Rapid (fastest)"];

/** "New service in one go": platform + kind, then one provider service per choice; prices are suggested. */
export function NewServiceBuilder({ platforms }: { platforms: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [platform, setPlatform] = useState(platforms[0]?.slug ?? "");
  const [kind, setKind] = useState("followers");
  const [tier, setTier] = useState(0);
  const [picks, setPicks] = useState<(Candidate | null)[]>([null, null, null]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const reset = () => setPicks([null, null, null]);
  const create = () =>
    start(async () => {
      const r = await createServiceAction({ platform, kind, picks: picks.map((p) => p?.id ?? null) });
      setMsg(r.ok ? { ok: true, text: r.message ?? "Created" } : { ok: false, text: r.error });
      if (r.ok) {
        reset();
        router.refresh();
      }
    });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <select value={platform} onChange={(e) => { setPlatform(e.target.value); reset(); }} className={input} aria-label="Platform">
          {platforms.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
        </select>
        <select value={kind} onChange={(e) => { setKind(e.target.value); reset(); }} className={input} aria-label="Kind">
          {["followers", "likes", "views", "comments", "live"].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-3">
        {TIERS.map((label, i) => (
          <button key={label} type="button" onClick={() => setTier(i)} aria-pressed={tier === i}
            className={`rounded-xl border-2 p-2 text-left text-xs ${tier === i ? "border-[#00209F]" : "border-[#E5E7EF] dark:border-border"}`}>
            <span className="block font-bold">{label}</span>
            <span className="block text-muted">{picks[i] ? `${picks[i]!.supplierName} #${picks[i]!.serviceId} · ${htg(picks[i]!.suggestedPrice)}` : "Not picked (optional)"}</span>
          </button>
        ))}
      </div>
      <CandidateList query={{ platform, kind, tier }}>
        {(c) => (
          <button type="button" onClick={() => setPicks((p) => p.map((x, i) => (i === tier ? c : x)))} className="h-8 rounded-lg bg-[#00209F] px-2.5 text-[11px] font-bold text-white">
            Use for {TIERS[tier].split(" (")[0]}
          </button>
        )}
      </CandidateList>
      {msg && <p className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
      <button type="button" disabled={pending || !picks.some(Boolean)} onClick={create} className="h-10 self-start rounded-[10px] bg-[#00209F] px-4 text-sm font-bold text-white disabled:opacity-50">
        {pending ? "…" : "Create the service and put it on sale"}
      </button>
    </div>
  );
}
