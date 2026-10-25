import { Link } from "@/i18n/navigation";

/**
 * Top bar of an inner screen (mockup): optional back arrow, title, optional item on the right.
 * On phones it replaces the site header for these screens (see HeaderSlot).
 */
export function PageBar({ title, back, backLabel, right, children }: { title: string; back?: string; backLabel?: string; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-30 border-b border-border bg-surface md:static md:border-0 md:bg-transparent">
      <div className={`mx-auto flex max-w-[560px] items-center gap-2 ${back ? "px-3 py-2.5" : "px-5 py-4"}`}>
        {back && (
          <Link href={back} aria-label={backLabel} className="grid h-11 w-11 place-items-center rounded-xl text-text hover:bg-surface-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="15 18 9 12 15 6" /></svg>
          </Link>
        )}
        <h1 className={`flex-1 font-extrabold ${back ? "text-lg" : "text-xl"}`}>{title}</h1>
        {right}
      </div>
      {children && <div className="mx-auto max-w-[560px] px-5 pb-3">{children}</div>}
    </div>
  );
}
