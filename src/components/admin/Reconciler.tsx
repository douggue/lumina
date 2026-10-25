"use client";
import { useState, useTransition } from "react";
import { approvePayment, reconcileStatement, type ReconcileResult } from "@/actions/admin";
import { ActionButton } from "./ActionButton";

const htg = (n: number) => `${(n / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })} HTG`;

export function Reconciler({ providers }: { providers: { value: string; label: string }[] }) {
  const [provider, setProvider] = useState(providers[0].value);
  const [days, setDays] = useState(30);
  const [text, setText] = useState("");
  const [res, setRes] = useState<{ result: ReconcileResult; rows: number } | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = () => start(async () => {
    setError("");
    const r = await reconcileStatement(text, provider, days);
    if (r.ok) setRes({ result: r.result, rows: r.rows });
    else setError(r.error);
  });

  return (
    <div className="space-y-6">
      <div className="card space-y-3 p-5">
        <div className="flex flex-wrap gap-3">
          <label><span className="label">Provider</span><select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>{providers.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
          <label><span className="label">Compare with the last</span><select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90].map((d) => <option key={d} value={d}>{d} days</option>)}</select></label>
          <label><span className="label">Statement file (CSV)</span><input type="file" accept=".csv,text/csv" className="block w-full max-w-full text-sm" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} /></label>
        </div>
        <textarea className="input py-2 font-mono text-xs" rows={5} placeholder={"or paste it here, e.g.\nreference,amount,date\nNC123456,2500,2026-10-14"} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="button" className="btn-primary" disabled={pending || !text.trim()} onClick={run}>{pending ? "Comparing…" : "Compare"}</button>
        {error && <p className="rounded-xl bg-danger-soft px-4 py-2.5 text-sm text-danger">{error}</p>}
      </div>
      {res && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              ["Matched", res.result.matched.length, ""],
              ["Paid, waiting for approval", res.result.toApprove.length, "text-primary"],
              ["Amount or status differs", res.result.mismatched.length, "text-warning"],
              ["In statement, not here", res.result.unknown.length, "text-warning"],
              ["Credited here, not in statement", res.result.missing.length, "text-danger"],
            ].map(([l, n, c]) => <div key={l as string} className="card p-4"><p className="text-xs text-muted">{l}</p><p className={`text-2xl font-bold ${c}`}>{n}</p></div>)}
          </div>
          <p className="text-sm text-muted">{res.rows} statement lines read.</p>
          {res.result.missing.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-2 font-semibold text-danger">Credited here but not in the statement: investigate first</h2>
              <ul className="space-y-1 text-sm">{res.result.missing.map((m) => <li key={m.id} className="font-mono">{m.reference} · {htg(m.amount)} · {m.customer} · {m.at.slice(0, 10)}</li>)}</ul>
            </section>
          )}
          {res.result.toApprove.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-2 font-semibold">In the statement and waiting for approval</h2>
              <ul className="space-y-2 text-sm">
                {res.result.toApprove.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono">{m.reference} · {htg(m.amount)} · {m.customer}</span>
                    <ActionButton label="Approve" className="btn-primary min-h-8 px-3 text-xs" confirm={`Approve ${m.reference}?`} action={(note) => approvePayment(m.id, note || "Matched on statement")} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {res.result.mismatched.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-2 font-semibold">Amount or status differs</h2>
              <ul className="space-y-1 text-sm">{res.result.mismatched.map((m) => <li key={m.id} className="font-mono">{m.reference} · statement {htg(m.statement)} · here {htg(m.system)} ({m.status})</li>)}</ul>
            </section>
          )}
          {res.result.unknown.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-2 font-semibold">In the statement but no customer submitted it</h2>
              <ul className="space-y-1 text-sm">{res.result.unknown.map((m) => <li key={m.reference} className="font-mono">{m.reference} · {htg(m.amount)} {m.date ?? ""}</li>)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
