"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePage, savePage } from "@/actions/site";
import { BLOCK_LABELS, type PageBlock } from "@/lib/pages";
import { ImageField } from "./ImageField";

const LOCALES = [["ht", "Kreyòl"], ["fr", "Français"]] as const;
type L = Record<string, string>;
type PageData = { id?: string; slug: string; title: L; description: L; blocks: PageBlock[]; isPublished: boolean; showInFooter: boolean };

function newBlock(type: PageBlock["type"]): PageBlock {
  switch (type) {
    case "heading": return { type, text: {} };
    case "text": return { type, body: {} };
    case "image": return { type, url: "", caption: {} };
    case "button": return { type, label: {}, href: "/order" };
    case "faq": return { type, items: [{ q: {}, a: {} }] };
    case "products": return { type, category: "" };
  }
}

/** Block editor. Edit one language at a time with the language tabs; empty languages fall back to Kreyòl. */
export function PageEditor({ page, categories }: { page?: PageData; categories: { slug: string; name: string }[] }) {
  const router = useRouter();
  const [p, setP] = useState<PageData>(page ?? { slug: "", title: {}, description: {}, blocks: [newBlock("text")], isPublished: false, showInFooter: false });
  const [lang, setLang] = useState<string>("ht");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const setBlock = (i: number, b: PageBlock) => setP({ ...p, blocks: p.blocks.map((x, j) => (j === i ? b : x)) });
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= p.blocks.length) return;
    const blocks = [...p.blocks];
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    setP({ ...p, blocks });
  };
  const lv = (o: L | undefined) => o?.[lang] ?? "";
  const ls = (o: L | undefined, v: string) => ({ ...(o ?? {}), [lang]: v });

  return (
    <div className="space-y-5">
      <div className="card space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className="label">Slug (address)</span><input className="input" value={p.slug} onChange={(e) => setP({ ...p, slug: e.target.value })} placeholder="kijan-pou-achte" /></label>
          <div className="flex items-end gap-5 pb-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={p.isPublished} onChange={(e) => setP({ ...p, isPublished: e.target.checked })} /> Published</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={p.showInFooter} onChange={(e) => setP({ ...p, showInFooter: e.target.checked })} /> Link in footer</label>
          </div>
        </div>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Language">
          {LOCALES.map(([code, name]) => (
            <button key={code} type="button" role="tab" aria-selected={lang === code} onClick={() => setLang(code)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${lang === code ? "bg-primary text-white" : "bg-surface-2"}`}>{name}</button>
          ))}
        </div>
        <label className="block"><span className="label">Title ({lang.toUpperCase()})</span><input className="input" value={lv(p.title)} onChange={(e) => setP({ ...p, title: ls(p.title, e.target.value) })} /></label>
        <label className="block"><span className="label">Search description ({lang.toUpperCase()})</span><input className="input" value={lv(p.description)} onChange={(e) => setP({ ...p, description: ls(p.description, e.target.value) })} /></label>
      </div>

      {p.blocks.map((b, i) => (
        <div key={i} className="card space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{BLOCK_LABELS[b.type]}</span>
            <div className="flex gap-1 text-xs">
              <button type="button" className="btn-ghost min-h-8 px-2" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">▲</button>
              <button type="button" className="btn-ghost min-h-8 px-2" onClick={() => move(i, 1)} disabled={i === p.blocks.length - 1} aria-label="Move down">▼</button>
              <button type="button" className="btn-ghost min-h-8 px-2 text-danger" onClick={() => setP({ ...p, blocks: p.blocks.filter((_, j) => j !== i) })}>Remove</button>
            </div>
          </div>
          {b.type === "heading" && <input className="input" aria-label="Heading" value={lv(b.text)} onChange={(e) => setBlock(i, { ...b, text: ls(b.text, e.target.value) })} />}
          {b.type === "text" && <textarea className="input py-2" rows={5} aria-label="Text" placeholder="Blank line = new paragraph" value={lv(b.body)} onChange={(e) => setBlock(i, { ...b, body: ls(b.body, e.target.value) })} />}
          {b.type === "image" && (
            <>
              <ImageFieldControlled url={b.url} onChange={(url) => setBlock(i, { ...b, url })} />
              <input className="input" placeholder="Caption (optional)" value={lv(b.caption)} onChange={(e) => setBlock(i, { ...b, caption: ls(b.caption, e.target.value) })} />
            </>
          )}
          {b.type === "button" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="input" placeholder="Button text" value={lv(b.label)} onChange={(e) => setBlock(i, { ...b, label: ls(b.label, e.target.value) })} />
              <input className="input" placeholder="/order or https://…" value={b.href} onChange={(e) => setBlock(i, { ...b, href: e.target.value })} />
            </div>
          )}
          {b.type === "faq" && (
            <div className="space-y-2">
              {b.items.map((it, k) => (
                <div key={k} className="grid gap-2 rounded-xl bg-surface-2 p-3">
                  <input className="input" placeholder="Question" value={lv(it.q)} onChange={(e) => setBlock(i, { ...b, items: b.items.map((x, m) => (m === k ? { ...x, q: ls(x.q, e.target.value) } : x)) })} />
                  <textarea className="input py-2" rows={2} placeholder="Answer" value={lv(it.a)} onChange={(e) => setBlock(i, { ...b, items: b.items.map((x, m) => (m === k ? { ...x, a: ls(x.a, e.target.value) } : x)) })} />
                  <button type="button" className="justify-self-start text-xs text-danger" onClick={() => setBlock(i, { ...b, items: b.items.filter((_, m) => m !== k) })}>Remove question</button>
                </div>
              ))}
              <button type="button" className="btn-secondary min-h-9 px-3 text-xs" onClick={() => setBlock(i, { ...b, items: [...b.items, { q: {}, a: {} }] })}>+ Question</button>
            </div>
          )}
          {b.type === "products" && (
            <select className="input" value={b.category} onChange={(e) => setBlock(i, { ...b, category: e.target.value })}>
              <option value="">Choose a category</option>
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        {(Object.keys(BLOCK_LABELS) as PageBlock["type"][]).map((tp) => (
          <button key={tp} type="button" className="btn-secondary min-h-9 px-3 text-xs" onClick={() => setP({ ...p, blocks: [...p.blocks, newBlock(tp)] })}>+ {BLOCK_LABELS[tp]}</button>
        ))}
      </div>
      {msg && <p className={`rounded-xl px-4 py-2.5 text-sm ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{msg.text}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await savePage(p);
              if (!r.ok) return setMsg({ ok: false, text: r.error });
              setMsg({ ok: true, text: "Saved" });
              if (!p.id && r.id) router.push(`/admin/pages/${r.id}`);
              else router.refresh();
            })
          }
        >
          {pending ? "Saving…" : "Save page"}
        </button>
        {p.id && <button type="button" className="btn-ghost text-danger" onClick={() => { if (window.confirm("Delete this page?")) start(async () => { await deletePage(p.id!); router.push("/admin/pages"); }); }}>Delete</button>}
      </div>
    </div>
  );
}

function ImageFieldControlled({ url, onChange }: { url: string; onChange: (url: string) => void }) {
  return <ImageField name="blockImage" label="Image" value={url} folder="products" aspect="aspect-[16/9]" onChange={onChange} />;
}
