/** Uploaded logo (Settings → Brand images) or the built-in HaitiViral logo (navy mark + "HaitiViral" word). */
export function Logo({ className = "", src, darkSrc, alt = "HaitiViral" }: { className?: string; src?: string; darkSrc?: string; alt?: string }) {
  if (src) {
    return (
      <span className={`inline-flex items-center ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={`h-8 w-auto max-w-[160px] object-contain ${darkSrc ? "dark:hidden" : ""}`} />
        {darkSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={darkSrc} alt={alt} className="hidden h-8 w-auto max-w-[160px] object-contain dark:block" />
        )}
      </span>
    );
  }
  // Built-in logo: the mark (public/brand/mark.png) + the word "HaitiViral" in the site font, so it reads in light and dark mode.
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/mark.png" alt="" width={32} height={32} className="h-8 w-8 rounded-[9px]" />
      <span className="display text-lg font-extrabold tracking-tight text-text max-[349px]:sr-only">
        Haiti<span className="text-[#D21034] dark:text-[#FF5A73]">Viral</span>
      </span>
      <span className="sr-only">{alt === "HaitiViral" ? "" : alt}</span>
    </span>
  );
}
