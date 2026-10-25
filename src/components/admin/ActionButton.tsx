"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { verifyStepUp } from "@/actions/admin";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** Runs an action; if it needs a fresh 2FA confirmation, asks for the code once and retries. */
export async function withStepUp(run: () => Promise<Result>): Promise<Result> {
  const first = await run();
  if (first.ok || first.error !== "STEP_UP_REQUIRED") return first;
  const code = window.prompt("Security check: enter the 6-digit code from your authenticator app to confirm this action.");
  if (!code) return { ok: false, error: "Cancelled: confirmation code required" };
  const v = await verifyStepUp(code);
  if (!v.ok) return v;
  return run();
}

/** Runs a server action; optionally asks for a note/reason first and confirms destructive actions. */
export function ActionButton({
  action,
  label,
  className = "btn-secondary min-h-9 px-3 text-xs",
  prompt,
  confirm,
}: {
  action: (note: string) => Promise<Result>;
  label: string;
  className?: string;
  prompt?: string;
  confirm?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          let note = "";
          if (prompt) {
            const v = window.prompt(prompt);
            if (v === null) return;
            note = v;
          }
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const r = await withStepUp(() => action(note));
            setMsg(r.ok ? { ok: true, text: r.message ?? "Done" } : { ok: false, text: r.error });
            router.refresh();
          });
        }}
      >
        {pending ? "…" : label}
      </button>
      {msg && <span className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</span>}
    </span>
  );
}

/** Wraps a <form> whose action returns a Result, showing the outcome inline. */
export function ActionForm({ action, children, className, resetOnSuccess }: { action: (fd: FormData) => Promise<Result>; children: React.ReactNode; className?: string; resetOnSuccess?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="min-w-0"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        start(async () => {
          const r = await withStepUp(() => action(fd));
          setMsg(r.ok ? { ok: true, text: r.message ?? "Saved" } : { ok: false, text: r.error });
          if (r.ok) {
            if (resetOnSuccess) form.reset();
            router.refresh();
          }
        });
      }}
    >
      <fieldset disabled={pending} className={`min-w-0 ${className ?? ""}`}>{children}</fieldset>
      {msg && <p className={`mt-3 rounded-xl px-4 py-2.5 text-sm ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`} role="status">{msg.text}</p>}
    </form>
  );
}
