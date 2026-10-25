"use client";
import { useState, useTransition } from "react";
import { setMarketing } from "@/actions/customer";

/** Promotions on/off switch (account screen). */
export function MarketingSwitch({ initial, label, sub }: { initial: boolean; label: string; sub: string }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <div className="flex min-h-[54px] items-center justify-between gap-2 border-b border-border">
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-xs text-muted">{sub}</span>
      </span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={pending}
        onClick={() => { const next = !on; setOn(next); start(async () => { const r = await setMarketing(next); if (!r.ok) setOn(!next); }); }}
        className="flex h-11 w-[60px] flex-none items-center justify-end">
        <span className={`flex h-7 w-12 rounded-full p-[3px] ${on ? "justify-end bg-text" : "justify-start bg-[#CBD2E1]"}`}><span className="h-[22px] w-[22px] rounded-full bg-white" /></span>
      </button>
    </div>
  );
}
