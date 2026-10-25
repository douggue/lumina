"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTheme } from "@/actions/content";
import { contrastRatio } from "@/lib/color";
import type { MotionStyle, ThemeConfig } from "@/lib/settings";

type ColorKey = "primary" | "primaryDark" | "navy" | "midnight" | "lightBg";
const COLORS: [ColorKey, string, string, number][] = [
  ["primary", "Main color, light mode (buttons, links)", "White text on it", 4.5],
  ["primaryDark", "Main color, dark mode", "Visible on the dark background", 3],
  ["midnight", "Dark background (and the hero in both modes)", "", 0],
  ["navy", "Dark mode cards and panels", "White text on it", 7],
  ["lightBg", "Light mode background", "Dark text on it", 10],
];

const MOTION: [MotionStyle, string, string][] = [
  ["calm", "Calm", "Soft fades and small lifts. Quiet and trustworthy."],
  ["lively", "Lively", "Springy entrances, buttons that squish, a cart counter that pops."],
  ["neon", "Neon", "Lively, plus glowing edges, a shining headline and a pulsing main button."],
];

const LANGS: [string, string][] = [["ht", "Kreyòl"], ["fr", "Français"]];

export function ThemeEditor({ initial, defaults, history }: { initial: ThemeConfig; defaults: ThemeConfig; history: { at: string; by: string; theme: ThemeConfig }[] }) {
  const router = useRouter();
  const [th, setTh] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof ThemeConfig>(k: K, v: ThemeConfig[K]) => setTh((p) => ({ ...p, [k]: v }));

  const ratio: Record<ColorKey, number> = {
    primary: contrastRatio(th.primary, "#FFFFFF"),
    primaryDark: contrastRatio(th.primaryDark, th.midnight),
    navy: contrastRatio(th.navy, "#FFFFFF"),
    midnight: 21,
    lightBg: contrastRatio(th.lightBg, "#0B1426"),
  };
  const ok = COLORS.every(([k, , , min]) => ratio[k] >= min);
  const publish = (t: ThemeConfig) =>
    start(async () => {
      const r = await saveTheme(t);
      setMsg(r.ok ? { ok: true, text: r.message ?? "Saved" } : { ok: false, text: r.error });
      router.refresh();
    });
  const glowA = (th.glow / 100) * 0.55;
  const displayFont = th.displayFont === "bold" ? "var(--font-display)" : "inherit";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <section className="card space-y-3 p-5">
          <h2 className="font-bold">Light or dark</h2>
          <p className="text-sm text-muted">What new visitors see first. Everyone can still switch with the moon button, and their choice is remembered.</p>
          <div className="grid grid-cols-2 gap-2">
            {(["dark", "light"] as const).map((m) => (
              <label key={m} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border-2 px-3 text-sm font-semibold ${th.defaultMode === m ? "border-primary bg-primary-soft" : "border-border"}`}>
                <input type="radio" name="defaultMode" checked={th.defaultMode === m} onChange={() => set("defaultMode", m)} /> {m === "dark" ? "Dark (recommended)" : "Light"}
              </label>
            ))}
          </div>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="font-bold">Colors</h2>
          {COLORS.map(([k, label, hint, min]) => (
            <label key={k} className="flex items-center gap-3">
              <input type="color" value={th[k]} onChange={(e) => set(k, e.target.value.toUpperCase())} className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-border" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{label}</span>
                {min > 0 && <span className={`text-xs ${ratio[k] >= min ? "text-muted" : "font-semibold text-danger"}`}>{hint}: {ratio[k].toFixed(1)}:1 (needs {min}:1) {ratio[k] >= min ? "✓" : "✗"}</span>}
              </span>
              <code className="text-xs">{th[k]}</code>
            </label>
          ))}
          <label className="block">
            <span className="label">Corner rounding: {th.radius}px</span>
            <input type="range" min={0} max={28} value={th.radius} onChange={(e) => set("radius", Number(e.target.value))} className="w-full" />
          </label>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="font-bold">Style and motion</h2>
          <fieldset className="space-y-2">
            <legend className="label">Motion style</legend>
            {MOTION.map(([id, name, desc]) => (
              <label key={id} className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 ${th.motion === id ? "border-primary bg-primary-soft" : "border-border"}`}>
                <input type="radio" name="motion" className="mt-1" checked={th.motion === id} onChange={() => set("motion", id)} />
                <span><b className="block text-sm">{name}</b><span className="text-xs text-muted">{desc}</span></span>
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={th.animations} onChange={(e) => set("animations", e.target.checked)} /> Animations on (always off for visitors who ask their device for reduced motion, and in data-saver mode)</label>
          <label className="block">
            <span className="label">Glow strength: {th.glow === 0 ? "off" : `${th.glow}%`}</span>
            <input type="range" min={0} max={100} step={10} value={th.glow} onChange={(e) => set("glow", Number(e.target.value))} className="w-full" />
          </label>
          <fieldset className="space-y-2">
            <legend className="label">Headings font</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["bold", "plain"] as const).map((f) => (
                <label key={f} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border-2 px-3 text-sm ${th.displayFont === f ? "border-primary bg-primary-soft" : "border-border"}`}>
                  <input type="radio" name="displayFont" checked={th.displayFont === f} onChange={() => set("displayFont", f)} />
                  <span style={{ fontFamily: f === "bold" ? "var(--font-display)" : "inherit", fontWeight: f === "bold" ? 800 : 600 }}>{f === "bold" ? "Bold" : "Plain"}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={th.heroGrid} onChange={(e) => set("heroGrid", e.target.checked)} /> Grid pattern behind the homepage hero</label>
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="font-bold">Scrolling band under the hero</h2>
          <p className="text-sm text-muted">Words separated by commas. Leave a language empty to hide the band in that language.</p>
          {LANGS.map(([code, name]) => (
            <label key={code} className="block">
              <span className="mb-1 block text-xs text-muted">{name}</span>
              <input className="input" maxLength={300} value={th.marquee[code] ?? ""} onChange={(e) => set("marquee", { ...th.marquee, [code]: e.target.value })} />
            </label>
          ))}
        </section>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={pending || !ok} onClick={() => publish(th)}>Publish theme</button>
          <button type="button" className="btn-secondary" onClick={() => setTh(defaults)}>Back to the original design</button>
        </div>
        {!ok && <p className="text-sm text-danger">Fix the colors marked ✗ before publishing.</p>}
        {msg && <p className={`rounded-xl px-4 py-2.5 text-sm ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{msg.text}</p>}
        {history.length > 0 && (
          <details className="card p-5 text-sm">
            <summary className="cursor-pointer font-semibold">Previous themes (rollback)</summary>
            <ul className="mt-3 space-y-2">
              {history.map((h) => (
                <li key={h.at} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-muted">
                    {[h.theme.primary, h.theme.midnight, h.theme.navy].map((c, i) => <span key={i} className="inline-block h-4 w-4 rounded border border-border" style={{ background: c }} />)}
                    {new Date(h.at).toLocaleString()} · {h.by}
                  </span>
                  <button type="button" className="text-primary underline" onClick={() => setTh(h.theme)}>Load</button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <section className="space-y-4 xl:sticky xl:top-6 xl:self-start" aria-label="Preview">
        <p className="text-sm font-semibold">Live preview</p>
        <div className="overflow-hidden rounded-2xl p-6 text-white" style={{ background: `radial-gradient(420px 220px at 85% 0%, rgba(47,116,255,${glowA}), transparent 65%), ${th.midnight}` }}>
          <p className="text-xs font-bold uppercase tracking-wider opacity-70">Homepage hero</p>
          <p className="mt-2 text-3xl font-bold leading-tight" style={{ fontFamily: displayFont }}>Rechaje jwèt ou an kèk segonn</p>
          <span className="mt-4 inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-bold text-white" style={{ background: th.primaryDark, boxShadow: `0 14px 34px -14px rgba(47,116,255,${glowA + 0.1})` }}>Achte kounye a →</span>
        </div>
        {(["light", "dark"] as const).map((mode) => (
          <div key={mode} className="rounded-2xl border border-border p-4" style={{ background: mode === "light" ? th.lightBg : th.midnight, color: mode === "light" ? "#0b1426" : "#eef3ff" }}>
            <p className="mb-3 text-xs uppercase tracking-wide opacity-70">{mode} mode {th.defaultMode === mode && "· default"}</p>
            <div className="p-4" style={{ background: mode === "light" ? "#fff" : th.navy, borderRadius: th.radius, border: `1px solid ${mode === "light" ? "#dbe3f1" : "#1f2f57"}` }}>
              <p className="font-bold" style={{ fontFamily: displayFont }}>Dyaman Free Fire</p>
              <p className="text-sm opacity-70">310 dyaman · 450 HTG</p>
              <div className="mt-3 flex gap-2">
                <span className="inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-semibold text-white" style={{ background: mode === "light" ? th.primary : th.primaryDark }}>Chwazi</span>
                <span className="inline-flex min-h-10 items-center px-2 text-sm font-semibold" style={{ color: mode === "light" ? th.primary : th.primaryDark }}>Wè tout</span>
              </div>
            </div>
          </div>
        ))}
        <p className="text-xs text-muted">Motion is not shown here: publish, then open the store to see it. Reduced-motion and data-saver visitors never see animations.</p>
      </section>
    </div>
  );
}
