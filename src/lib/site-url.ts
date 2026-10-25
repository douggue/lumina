/**
 * The site's own domain (e.g. https://www.haitiviral.com), from NEXT_PUBLIC_SITE_URL once the domain is connected.
 * Null while the site only lives on its .vercel.app address.
 */
export function ownDomain(): string | null {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  return explicit && !explicit.includes(".vercel.app") ? explicit : null;
}

/**
 * Public address of the site, without a trailing slash. Used for links in emails, SEO and payment returns.
 * - the own domain (NEXT_PUBLIC_SITE_URL) when it is set;
 * - otherwise NEXT_PUBLIC_SITE_URL as given, then the Vercel address, then localhost for development.
 */
export function siteUrl(): string {
  const own = ownDomain();
  if (own) return own;
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/** Same link, on the site's own domain (emails must never point to the .vercel.app address). */
export function onSiteDomain(url: string): string {
  try {
    const u = new URL(url);
    const site = new URL(siteUrl());
    u.protocol = site.protocol;
    u.host = site.host;
    for (const key of ["callbackURL", "redirectTo"]) {
      const v = u.searchParams.get(key);
      if (v && /^https?:\/\//.test(v)) {
        const inner = new URL(v);
        inner.protocol = site.protocol;
        inner.host = site.host;
        u.searchParams.set(key, inner.toString());
      }
    }
    return u.toString();
  } catch {
    return url;
  }
}
