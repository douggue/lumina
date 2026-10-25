"use client";
import { useEffect, useState } from "react";
import { INSTALL_EVENT, isStandalone } from "@/lib/pwa-client";

/** Notifications screen (mockup): dark "install the app" card; hidden once the app is installed. Tapping opens the install help. */
export function InstallCard({ title, body }: { title: string; body: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => setShow(!isStandalone()), []);
  if (!show) return null;
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(INSTALL_EVENT))} className="flex items-center gap-3 rounded-2xl bg-[#0F172A] p-3.5 text-left text-white">
      <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-white text-[#0F172A]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M11 18h2" /></svg>
      </span>
      <span className="flex flex-1 flex-col gap-[3px]">
        <span className="text-sm font-extrabold">{title}</span>
        <span className="text-xs leading-snug text-[#CBD5E1]">{body}</span>
      </span>
    </button>
  );
}
