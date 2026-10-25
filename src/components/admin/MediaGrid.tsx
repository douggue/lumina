"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMedia, saveMediaAlt, type MediaItem } from "@/actions/ops";

function Tile({ m }: { m: MediaItem }) {
  const router = useRouter();
  const [alt, setAlt] = useState(m.alt ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message ?? "Done" } : { ok: false, text: r.error });
      router.refresh();
    });
  return (
    <div className="card overflow-hidden" data-testid="media-tile">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={m.url} alt={m.alt ?? ""} className="aspect-square w-full bg-surface-2 object-cover" loading="lazy" />
      <div className="space-y-2 p-3">
        <p className="text-[11px] text-muted">{m.folder} · {new Date(m.createdAt).toLocaleDateString("en-US")}</p>
        <input className="input min-h-9 text-xs" placeholder="Alt text" value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} aria-label="Alt text" />
        <div className="flex flex-wrap gap-1">
          <button type="button" className="btn-secondary min-h-8 px-2 text-xs" disabled={pending} onClick={() => run(() => saveMediaAlt(m.id, alt))}>Save</button>
          <button
            type="button"
            className="btn-secondary min-h-8 px-2 text-xs"
            onClick={async () => {
              const full = m.url.startsWith("/") ? location.origin + m.url : m.url;
              await navigator.clipboard?.writeText(full).catch(() => {});
              setMsg({ ok: true, text: "URL copied" });
            }}
          >
            Copy URL
          </button>
          <button type="button" className="btn-secondary min-h-8 px-2 text-xs text-danger" disabled={pending} onClick={() => confirm("Delete this image for good?") && run(() => deleteMedia(m.id))}>Delete</button>
        </div>
        {msg && <p className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}

export function MediaGrid({ items }: { items: MediaItem[] }) {
  if (!items.length) return <p className="card p-8 text-center text-sm text-muted">No images yet. Upload one above, or use “Find existing images”.</p>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((m) => <Tile key={m.id} m={m} />)}
    </div>
  );
}
