import type { Locale } from "@/i18n/routing";

/**
 * Small round flags for the language picker. Drawn as SVG so they look the same everywhere
 * (Windows does not draw flag emoji). Kreyòl → Haiti (real flag file in /public/flags), Français → France.
 */
export function Flag({ locale, size = 22, className = "" }: { locale: Locale; size?: number; className?: string }) {
  // Haiti: the real flag with the coat of arms (flag-icons, MIT), zoomed a little so the arms show in the small circle.
  if (locale === "ht") {
    return (
      <span style={{ width: size, height: size }} className={`relative inline-block shrink-0 overflow-hidden rounded-full ring-1 ring-black/10 ${className}`} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/flags/ht.svg" alt="" width={size} height={size} decoding="async" className="h-full w-full scale-[1.35] object-cover" />
      </span>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`shrink-0 rounded-full ring-1 ring-black/10 ${className}`} aria-hidden>
      <clipPath id={`flag-${locale}`}>
        <circle cx="12" cy="12" r="12" />
      </clipPath>
      <g clipPath={`url(#flag-${locale})`}>{FLAGS[locale]}</g>
    </svg>
  );
}

const FLAGS: Record<Locale, React.ReactNode> = {
  ht: (
    <>
      <rect width="24" height="12" fill="#00209F" />
      <rect y="12" width="24" height="12" fill="#D21034" />
      <rect x="7.5" y="8.5" width="9" height="7" rx="0.5" fill="#fff" />
      <path d="M12 9.5v4.5" stroke="#016A16" strokeWidth="1.2" />
      <path d="M9.5 14h5" stroke="#016A16" strokeWidth="1" />
    </>
  ),
  fr: (
    <>
      <rect width="8" height="24" fill="#0055A4" />
      <rect x="8" width="8" height="24" fill="#fff" />
      <rect x="16" width="8" height="24" fill="#EF4135" />
    </>
  ),
};
