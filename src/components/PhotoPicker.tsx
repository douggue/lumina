"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { compressImage } from "@/lib/compress-image";

/**
 * Optional photo for a form (support message, payment proof…): a tap target with preview, Change and Remove.
 * The photo is shrunk in the browser, then placed in a hidden file input named `name`,
 * so the surrounding form sends it as usual.
 */
export function PhotoPicker({ name, label, hint, compact = false }: { name: string; label: string; hint?: string; compact?: boolean }) {
  const tw = useTranslations("wallet");
  const pick = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [shot, setShot] = useState<{ url: string; size: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = `photo-${name}`;

  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot.url);
  }, [shot]);

  // A sent form is reset by React: clear the preview too.
  useEffect(() => {
    const form = field.current?.form;
    if (!form) return;
    const onReset = () => setShot(null);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  async function choose(f: File | undefined) {
    if (!f) return;
    setError("");
    setBusy(true);
    try {
      const small = await compressImage(f);
      const dt = new DataTransfer();
      dt.items.add(small);
      if (field.current) field.current.files = dt.files;
      setShot({ url: URL.createObjectURL(small), size: small.size });
    } catch {
      clear();
      setError(tw("uploadBad"));
    } finally {
      setBusy(false);
      if (pick.current) pick.current.value = "";
    }
  }

  function clear() {
    if (field.current) field.current.value = "";
    setShot(null);
  }

  return (
    <div>
      <input ref={pick} id={id} type="file" accept="image/*" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
      <input ref={field} name={name} type="file" className="hidden" tabIndex={-1} aria-hidden />
      {shot ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.url} alt="" className="h-14 w-14 rounded-xl object-cover" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">✓ {label}</span>
            <span className="text-xs text-muted">{Math.max(1, Math.round(shot.size / 1024))} KB</span>
          </span>
          <label htmlFor={id} className="btn-secondary min-h-10 cursor-pointer px-3 text-xs">{tw("uploadChange")}</label>
          <button type="button" onClick={clear} className="min-h-10 px-2 text-xs font-semibold text-danger">{tw("uploadRemove")}</button>
        </div>
      ) : (
        <label
          htmlFor={id}
          className={`flex cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-surface-2/60 px-4 text-center transition-colors hover:border-primary ${compact ? "min-h-12" : "min-h-[4.5rem]"}`}
        >
          {busy ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className="shrink-0 text-primary" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="3" />
              <circle cx="12" cy="12" r="3.2" />
              <path d="M8 5l1.2-2h5.6L16 5" />
            </svg>
          )}
          <span className="text-left">
            <span className="block text-sm font-bold">{label}</span>
            {!compact && <span className="block text-xs text-muted">{hint ?? tw("uploadHint")}</span>}
          </span>
        </label>
      )}
      {error && <p className="mt-1 text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}
