"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadImage } from "@/actions/admin";
import { listMedia, type MediaItem } from "@/actions/ops";

type Folder = "products" | "categories" | "brand";

async function upload(file: File, folder: Folder) {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("folder", folder);
  return uploadImage(fd);
}

/** Modal grid of already-uploaded images. */
function LibraryPicker({ onPick, onClose }: { onPick: (url: string) => void; onClose: () => void }) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    listMedia().then(setItems, () => setError("Could not load the library"));
  }, []);
  const shown = (items ?? []).filter((m) => !q || (m.alt ?? "").toLowerCase().includes(q.toLowerCase()) || m.folder.includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Media library" onClick={onClose}>
      <div className="card max-h-[85vh] w-full max-w-3xl overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <input className="input min-h-9" placeholder="Filter by alt text or folder" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="button" className="btn-secondary min-h-9 px-3 text-xs" onClick={onClose}>Close</button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {items === null && !error && <p className="text-sm text-muted">Loading…</p>}
        {items && shown.length === 0 && <p className="text-sm text-muted">No images.</p>}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {shown.map((m) => (
            <button key={m.id} type="button" className="overflow-hidden rounded-lg border border-border hover:border-primary" onClick={() => onPick(m.url)} title={m.alt ?? m.url}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.alt ?? ""} className="aspect-square w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Single image: uploads immediately, keeps the URL in a hidden input named `name`. */
export function ImageField({ name, label, value, folder, hint, aspect = "aspect-[4/3]", onChange, refreshOnUpload }: { name: string; label: string; value?: string | null; folder: Folder; hint?: string; aspect?: string; onChange?: (url: string) => void; refreshOnUpload?: boolean }) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [url, setUrlState] = useState(value ?? "");
  const setUrl = (u: string) => {
    setUrlState(u);
    onChange?.(u);
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <span className="label">{label}</span>
      <input type="hidden" name={name} value={url} />
      <div className="flex items-start gap-3">
        <div className={`grid w-24 shrink-0 place-items-center sm:w-32 overflow-hidden rounded-xl border border-dashed border-border bg-surface-2 ${aspect}`}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-muted">No image</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="block w-full max-w-full text-sm file:mr-2 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2"
            disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              setError("");
              const r = await upload(f, folder);
              setBusy(false);
              if (r.ok) {
                setUrl(r.url);
                if (refreshOnUpload) router.refresh();
              } else setError(r.error);
              if (input.current) input.current.value = "";
            }}
          />
          {!refreshOnUpload && <button type="button" className="text-xs text-primary underline" onClick={() => setPicking(true)}>Choose from library</button>}
          {picking && <LibraryPicker onClose={() => setPicking(false)} onPick={(u) => { setUrl(u); setPicking(false); }} />}
          {busy && <p className="text-xs text-muted">Uploading…</p>}
          {url && <button type="button" className="text-xs text-danger underline" onClick={() => setUrl("")}>Remove image</button>}
          {hint && <p className="text-xs text-muted">{hint}</p>}
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      </div>
    </div>
  );
}

/** Several images: each URL is submitted as a repeated hidden input named `name`. */
export function GalleryField({ name, label, value = [], folder, max = 8 }: { name: string; label: string; value?: string[]; folder: Folder; max?: number }) {
  const [urls, setUrls] = useState<string[]>(value);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div>
      <span className="label">{label}</span>
      {urls.map((u) => <input key={u} type="hidden" name={name} value={u} />)}
      <div className="flex flex-wrap gap-2">
        {urls.map((u, i) => (
          <div key={u} className="relative h-20 w-24 overflow-hidden rounded-lg border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/60 px-1 text-[11px] text-white">
              <button type="button" disabled={i === 0} onClick={() => setUrls((p) => { const n = [...p]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}>←</button>
              <button type="button" onClick={() => setUrls((p) => p.filter((x) => x !== u))}>✕</button>
            </div>
          </div>
        ))}
        {urls.length < max && (
          <label className={`grid h-20 w-24 cursor-pointer place-items-center rounded-lg border border-dashed border-border text-xs text-muted ${busy ? "opacity-50" : ""}`}>
            {busy ? "…" : "+ Add"}
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={async (e) => {
                const files = [...(e.target.files ?? [])].slice(0, max - urls.length);
                setBusy(true);
                setError("");
                for (const f of files) {
                  const r = await upload(f, folder);
                  if (r.ok) setUrls((p) => [...p, r.url]);
                  else setError(r.error);
                }
                setBusy(false);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      {urls.length < max && <button type="button" className="mt-1 text-xs text-primary underline" onClick={() => setPicking(true)}>Add from library</button>}
      {picking && <LibraryPicker onClose={() => setPicking(false)} onPick={(u) => { setUrls((p) => (p.includes(u) ? p : [...p, u])); setPicking(false); }} />}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
