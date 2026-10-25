"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveNavigation } from "@/actions/site";
import type { NavLink } from "@/lib/settings";

const LOCALES = ["ht", "fr"] as const;
const DEFAULT_HEADER: NavLink[] = [
  { label: { ht: "Kòmande", fr: "Commander" }, href: "/order" },
  { label: { ht: "Eseye gratis", fr: "Essai gratuit" }, href: "/trial" },
  { label: { ht: "Gid peman", fr: "Guides de paiement" }, href: "/guides" },
  { label: { ht: "Nouvèl", fr: "Actualités" }, href: "/news" },
];

function LinkList({ title, links, onChange }: { title: string; links: NavLink[]; onChange: (l: NavLink[]) => void }) {
  const set = (i: number, l: NavLink) => onChange(links.map((x, j) => (j === i ? l : x)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= links.length) return;
    const n = [...links];
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
  };
  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-semibold">{title}</h2>
      {links.length === 0 && <p className="text-sm text-muted">No custom links.</p>}
      {links.map((l, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-border p-3">
          <div className="flex gap-2">
            <input className="input" aria-label="Link address" placeholder="/order or https://…" value={l.href} onChange={(e) => set(i, { ...l, href: e.target.value })} />
            <button type="button" className="btn-ghost min-h-11 px-2" onClick={() => move(i, -1)} aria-label="Move up">▲</button>
            <button type="button" className="btn-ghost min-h-11 px-2" onClick={() => move(i, 1)} aria-label="Move down">▼</button>
            <button type="button" className="btn-ghost min-h-11 px-2 text-danger" onClick={() => onChange(links.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            {LOCALES.map((loc) => <input key={loc} className="input" aria-label={`Label ${loc}`} placeholder={loc.toUpperCase()} value={l.label[loc] ?? ""} onChange={(e) => set(i, { ...l, label: { ...l.label, [loc]: e.target.value } })} />)}
          </div>
        </div>
      ))}
      <button type="button" className="btn-secondary min-h-9 px-3 text-xs" onClick={() => onChange([...links, { label: {}, href: "/" }])}>+ Add link</button>
    </section>
  );
}

export function NavigationEditor({ initial }: { initial: { header: NavLink[]; footer: NavLink[] } }) {
  const router = useRouter();
  const [nav, setNav] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <LinkList title="Header menu" links={nav.header} onChange={(header) => setNav({ ...nav, header })} />
        <LinkList title="Extra footer links" links={nav.footer} onChange={(footer) => setNav({ ...nav, footer })} />
      </div>
      <div className="flex flex-wrap gap-2">
        {nav.header.length === 0 && <button type="button" className="btn-secondary" onClick={() => setNav({ ...nav, header: DEFAULT_HEADER })}>Start from the standard menu</button>}
        <button type="button" className="btn-primary" disabled={pending} onClick={() => start(async () => { const r = await saveNavigation(nav); setMsg(r.ok ? { ok: true, text: r.message ?? "Saved" } : { ok: false, text: r.error }); router.refresh(); })}>Publish navigation</button>
      </div>
      {msg && <p className={`rounded-xl px-4 py-2.5 text-sm ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
