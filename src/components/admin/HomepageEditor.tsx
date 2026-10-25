"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreHomepage, saveHomepage } from "@/actions/content";
import { HOME_SECTION_LABELS, type HomepageConfig } from "@/lib/homepage";

const LOCALES = [["ht", "Kreyòl"], ["fr", "Français"]] as const;
const FIELDS = [["eyebrow", "Small label above the title"], ["title", "Headline"], ["subtitle", "Sub-headline"]] as const;

export function HomepageEditor({ initial, unpublishedChanges, history }: { initial: HomepageConfig; unpublishedChanges: boolean; history: { at: string; by: string }[] }) {
  const router = useRouter();
  const [cfg, setCfg] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(unpublishedChanges ? { ok: true, text: "The draft has changes that aren't published yet." } : null);
  const [pending, start] = useTransition();

  const move = (i: number, d: -1 | 1) =>
    setCfg((c) => {
      const s = [...c.sections];
      const j = i + d;
      if (j < 0 || j >= s.length) return c;
      [s[i], s[j]] = [s[j], s[i]];
      return { ...c, sections: s };
    });
  const run = (publish: boolean) =>
    start(async () => {
      const r = await saveHomepage(cfg, publish);
      setMsg(r.ok ? { ok: true, text: r.message ?? "Saved" } : { ok: false, text: r.error });
      router.refresh();
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
      <section className="card h-fit p-5">
        <h2 className="mb-1 font-semibold">Sections</h2>
        <p className="mb-4 text-xs text-muted">The hero is always first. Use the arrows to reorder.</p>
        <ul className="space-y-2">
          {cfg.sections.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2 rounded-xl border border-border p-2.5">
              <div className="flex flex-col">
                <button type="button" className="px-1 text-xs disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">▲</button>
                <button type="button" className="px-1 text-xs disabled:opacity-30" disabled={i === cfg.sections.length - 1} onClick={() => move(i, 1)} aria-label="Move down">▼</button>
              </div>
              <span className={`flex-1 text-sm ${s.visible ? "" : "text-muted line-through"}`}>{HOME_SECTION_LABELS[s.id]}</span>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={s.visible} onChange={(e) => setCfg((c) => ({ ...c, sections: c.sections.map((x) => (x.id === s.id ? { ...x, visible: e.target.checked } : x)) }))} />
                Visible
              </label>
            </li>
          ))}
        </ul>
        <label className="mt-4 block">
          <span className="label">Main button link</span>
          <input className="input" value={cfg.ctaHref} onChange={(e) => setCfg({ ...cfg, ctaHref: e.target.value })} placeholder="/order" />
          <span className="mt-1 block text-xs text-muted">A path on this site, e.g. /order or /categories/tiktok</span>
        </label>
      </section>

      <section className="card space-y-5 p-5">
        <div>
          <h2 className="font-semibold">Hero text</h2>
          <p className="text-xs text-muted">Leave a box empty to keep the standard wording for that language.</p>
        </div>
        {FIELDS.map(([key, label]) => (
          <fieldset key={key} className="space-y-2">
            <legend className="label">{label}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {LOCALES.map(([l, name]) => (
                <label key={l}>
                  <span className="mb-1 block text-xs text-muted">{name}</span>
                  <input
                    className="input"
                    value={cfg.hero[key][l] ?? ""}
                    maxLength={key === "subtitle" ? 300 : 120}
                    onChange={(e) => setCfg((c) => ({ ...c, hero: { ...c.hero, [key]: { ...c.hero[key], [l]: e.target.value } } }))}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => run(false)}>Save draft</button>
          <a href="/ht?preview=1" target="_blank" className="btn-secondary" onClick={() => run(false)}>Save &amp; preview ↗</a>
          <button type="button" className="btn-primary" disabled={pending} onClick={() => { if (window.confirm("Publish the homepage for everyone?")) run(true); }}>Publish</button>
        </div>
        {msg && <p className={`rounded-xl px-4 py-2.5 text-sm ${msg.ok ? "bg-primary-soft text-primary" : "bg-danger-soft text-danger"}`}>{msg.text}</p>}
        {history.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">Previous versions</summary>
            <ul className="mt-2 space-y-1">
              {history.map((h, i) => (
                <li key={h.at} className="flex items-center justify-between gap-2">
                  <span className="text-muted">Replaced {new Date(h.at).toLocaleString()} by {h.by}</span>
                  <button type="button" className="text-primary underline" onClick={() => start(async () => { const r = await restoreHomepage(i); setMsg(r.ok ? { ok: true, text: r.message ?? "" } : { ok: false, text: r.error }); router.refresh(); })}>Load into draft</button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
