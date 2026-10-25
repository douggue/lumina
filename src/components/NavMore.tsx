"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";

const LINK = "shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-text";
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Header links: as many as fit in the space really available (any language, any screen), the rest under "More ▾".
 * Widths are measured from an invisible copy of the row, and re-measured when the window is resized.
 */
export function PriorityNav({ items, moreLabel }: { items: { href: string; label: string }[]; moreLabel: string }) {
  const box = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(Math.min(2, items.length));

  useIsoLayoutEffect(() => {
    const fit = () => {
      const avail = box.current?.clientWidth ?? 0;
      const kids = [...(ruler.current?.children ?? [])] as HTMLElement[];
      if (!kids.length) return;
      const more = kids[kids.length - 1].offsetWidth;
      const widths = kids.slice(0, -1).map((k) => k.offsetWidth + 4);
      const total = widths.reduce((a, b) => a + b, 0);
      if (total <= avail) return setCount(items.length);
      let used = more;
      let n = 0;
      while (n < widths.length && used + widths[n] <= avail) used += widths[n++];
      setCount(n);
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [items]);

  const hidden = items.slice(count);
  return (
    <div ref={box} className="relative ml-4 hidden min-w-0 flex-1 md:block">
      {/* invisible copy used only to measure each link */}
      <div ref={ruler} aria-hidden className="invisible absolute flex gap-1" style={{ left: -9999 }}>
        {items.map((n) => <span key={n.href} className={LINK}>{n.label}</span>)}
        <span className={LINK}>{moreLabel} ▾</span>
      </div>
      <nav className="flex items-center gap-1" aria-label="Main">
        {items.slice(0, count).map((n) => (
          <Link key={n.href} href={n.href} className={LINK}>{n.label}</Link>
        ))}
        {hidden.length > 0 && <MoreMenu label={moreLabel} items={hidden} />}
      </nav>
    </div>
  );
}

/** "More ▾": closes on navigation, outside tap and Escape. */
function MoreMenu({ label, items }: { label: string; items: { href: string; label: string }[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);
  useEffect(() => {
    const close = (e: Event) => {
      const d = ref.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  return (
    <details ref={ref} className="group relative">
      <summary className={`${LINK} flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden`}>
        {label} <span className="text-xs transition-transform group-open:rotate-180" aria-hidden>▾</span>
      </summary>
      <div className="absolute left-0 top-11 z-50 min-w-48 rounded-2xl border border-border bg-surface p-1.5 shadow-2xl">
        {items.map((n) => (
          <Link key={n.href} href={n.href} className="block whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold hover:bg-surface-2">
            {n.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
