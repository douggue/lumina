"use client";
import { useEffect, useRef } from "react";

/** Collapsible filters on phones; always open as a sidebar on wide screens. */
export function FiltersPanel({ title, defaultOpen, children }: { title: string; defaultOpen: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => { if (mq.matches && ref.current) ref.current.open = true; };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return (
    <details ref={ref} open={defaultOpen} className="card group p-4 lg:sticky lg:top-24">
      <summary className="flex cursor-pointer list-none items-center justify-between font-bold lg:pointer-events-none">
        <span>{title}</span>
        <span className="text-muted transition-transform group-open:rotate-180 lg:hidden" aria-hidden>▾</span>
      </summary>
      <div className="mt-4 space-y-5">{children}</div>
    </details>
  );
}
