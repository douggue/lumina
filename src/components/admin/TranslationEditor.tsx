"use client";
import { useMemo, useState, useTransition } from "react";
import { saveTranslation } from "@/actions/content";

const LOCALES = ["ht", "fr"] as const;
type Base = Record<(typeof LOCALES)[number], Record<string, string>>;

export function TranslationEditor({ keys, base, overrides }: { keys: string[]; base: Base; overrides: { locale: string; key: string; value: string }[] }) {
  const [q, setQ] = useState("");
  const [onlyCustom, setOnlyCustom] = useState(false);
  const [edits, setEdits] = useState(() => Object.fromEntries(overrides.map((o) => [`${o.locale}:${o.key}`, o.value])));
  const [status, setStatus] = useState<Record<string, string>>({});
  const [, start] = useTransition();
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return keys
      .filter((k) => !onlyCustom || LOCALES.some((l) => edits[`${l}:${k}`] !== undefined))
      .filter((k) => !needle || k.toLowerCase().includes(needle) || LOCALES.some((l) => (edits[`${l}:${k}`] ?? base[l][k] ?? "").toLowerCase().includes(needle)))
      .slice(0, 60);
  }, [q, onlyCustom, keys, base, edits]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input className="input max-w-md" placeholder="Search text or key, e.g. “Achte kounye a” or home.heroTitle" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyCustom} onChange={(e) => setOnlyCustom(e.target.checked)} /> Only edited</label>
      </div>
      <p className="text-xs text-muted">Showing {list.length} (max 60): refine the search to find more. Keep {"{placeholders}"} like {"{name}"} or {"{count}"} unchanged.</p>
      {list.map((k) => (
        <div key={k} className="card p-4">
          <p className="mb-2 font-mono text-xs text-muted">{k}</p>
          <div className="grid gap-2 md:grid-cols-2">
            {LOCALES.map((l) => {
              const id = `${l}:${k}`;
              const value = edits[id] ?? "";
              return (
                <label key={l} className="block">
                  <span className="mb-1 flex justify-between text-xs text-muted"><span>{l.toUpperCase()}</span><span>{status[id]}</span></span>
                  <textarea
                    rows={Math.min(4, Math.max(1, Math.ceil((value || base[l][k] || "").length / 60)))}
                    className={`input py-2 ${edits[id] !== undefined ? "border-primary" : ""}`}
                    placeholder={base[l][k] ?? "(missing)"}
                    value={value}
                    onChange={(e) => setEdits({ ...edits, [id]: e.target.value })}
                    onBlur={(e) => {
                      const v = e.target.value;
                      const original = overrides.find((o) => o.locale === l && o.key === k)?.value ?? "";
                      if (v === original && !status[id]) return;
                      setStatus((s) => ({ ...s, [id]: "Saving…" }));
                      start(async () => {
                        const r = await saveTranslation(l, k, v);
                        setStatus((s) => ({ ...s, [id]: r.ok ? (v ? "Saved" : "Default") : r.error }));
                        if (!v) setEdits((ed) => { const n = { ...ed }; delete n[id]; return n; });
                      });
                    }}
                  />
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
