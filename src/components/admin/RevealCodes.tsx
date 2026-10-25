"use client";
import { useState, useTransition } from "react";

export function RevealCodes({ action }: { action: (reason: string) => Promise<{ ok: true; codes: { item: string; code: string }[] } | { ok: false; error: string }> }) {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <section className="card p-5 text-sm">
      <h2 className="mb-2 font-semibold">Delivered codes</h2>
      {codes ? (
        <ul className="space-y-1 font-mono">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
      ) : (
        <button
          type="button"
          className="btn-secondary min-h-9 px-3 text-xs"
          disabled={pending}
          onClick={() => {
            const reason = window.prompt("Why do you need to see these codes? (logged)");
            if (!reason) return;
            start(async () => {
              const r = await action(reason);
              if (r.ok) setCodes(r.codes.map((c) => c.code));
              else setError(r.error);
            });
          }}
        >
          Reveal codes (audited)
        </button>
      )}
      {error && <p className="mt-2 text-danger">{error}</p>}
    </section>
  );
}
