"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendTestEmail } from "@/actions/ops";

export function TestEmailForm({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await sendTestEmail(to);
          setMsg(r.ok ? { ok: true, text: r.message ?? "Sent" } : { ok: false, text: r.error });
          router.refresh();
        });
      }}
    >
      <input type="email" className="input" placeholder="you@example.com" value={to} onChange={(e) => setTo(e.target.value)} required />
      <button className="btn-primary min-h-9 px-4 text-xs" disabled={pending || disabled}>{pending ? "Sending…" : "Send test email"}</button>
      {disabled && <p className="text-xs text-muted">Available once email is on.</p>}
      {msg && <p className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
    </form>
  );
}
