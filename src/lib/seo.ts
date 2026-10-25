import { siteUrl } from "./site-url";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { t } from "@/lib/text";
import { locales } from "@/i18n/routing";

const base = () => siteUrl();

/** Canonical + hreflang links for a localized path ("" for home, "/store", …). */
export function alternates(locale: string, path: string) {
  const languages: Record<string, string> = {};
  for (const l of locales) languages[l] = `${base()}/${l}${path}`;
  languages["x-default"] = `${base()}/ht${path}`;
  return { canonical: `${base()}/${locale}${path}`, languages };
}

/** Metadata for a fixed page, applying any title/description override from Admin → SEO. */
export async function pageSeo(locale: string, path: string, title?: string, description?: string): Promise<Metadata> {
  const o = await prisma.pageSeo.findUnique({ where: { path } }).catch(() => null);
  const oTitle = o ? t(o.title, locale) : "";
  const oDesc = o ? t(o.description, locale) : "";
  return {
    ...(oTitle ? { title: path === "/" ? { absolute: oTitle } : oTitle } : title ? { title } : {}),
    ...(oDesc || description ? { description: oDesc || description } : {}),
    alternates: alternates(locale, path === "/" ? "" : path),
  };
}
