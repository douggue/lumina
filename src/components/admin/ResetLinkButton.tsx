"use client";
import { useState, useTransition } from "react";

type Res = { ok: true; url: string; phone: string | null } | { ok: false; error: string };

/** Creates a one-time reset link that staff send to the customer (e.g. on WhatsApp) after checking it's them. */
export function ResetLinkButton({ action }: { action: () => Promise<Res> }) {
  const [res, setRes] = useState<Res | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="card space-y-3 p-5">
      <h2 className="font-semibold">Password reset</h2>
      <p className="text-xs text-muted">Only after confirming it's really the customer (e.g. the WhatsApp number on file, a recent order number). The link works once, for 1 hour, and signs them out of all devices.</p>
      <button
        type="button"
        className="btn-secondary min-h-9 px-3 text-xs"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Have you verified this customer's identity?")) return;
          start(async () => setRes(await action()));
        }}
      >
        {pending ? "…" : "Create reset link"}
      </button>
      {res && !res.ok && <p className="text-sm text-danger">{res.error}</p>}
      {res?.ok && (
        <div className="space-y-2">
          <input readOnly value={res.url} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary min-h-9 px-3 text-xs" onClick={async () => { await navigator.clipboard.writeText(res.url); setCopied(true); }}>
              {copied ? "Copied" : "Copy link"}
            </button>
            {res.phone && (
              <a className="btn min-h-9 bg-[#1fa855] px-3 text-xs text-white" target="_blank" rel="noopener" href={`https://wa.me/${res.phone.replace(/\D/g, "")}?text=${encodeURIComponent(res.url)}`}>
                Send on WhatsApp
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
