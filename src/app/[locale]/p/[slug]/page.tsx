import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { t } from "@/lib/text";
import { alternates } from "@/lib/seo";
import { blocksSchema, safeHref } from "@/lib/pages";
import { searchProducts } from "@/lib/catalog";
import { Link } from "@/i18n/navigation";

type P = Promise<{ locale: string; slug: string }>;
const load = (slug: string) => prisma.page.findFirst({ where: { slug, isPublished: true } });

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const { locale, slug } = await params;
  const p = await load(slug);
  if (!p) return {};
  return { title: t(p.title, locale), description: t(p.description, locale) || undefined, alternates: alternates(locale, `/p/${slug}`) };
}

/** Custom pages built in Admin → Pages. Text is rendered as plain text (no HTML from the editor). */
export default async function CustomPage({ params }: { params: P }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const page = await load(slug);
  if (!page) notFound();
  const parsed = blocksSchema.safeParse(page.blocks);
  const blocks = parsed.success ? parsed.data : [];
  const tc = await getTranslations("common");
  const productLists = await Promise.all(blocks.map((b) => (b.type === "products" ? searchProducts({ category: b.category, take: 8 }) : Promise.resolve(null))));
  return (
    <div className="container-page max-w-4xl space-y-6 py-10 sm:py-14">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t(page.title, locale)}</h1>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return <h2 key={i} className="pt-2 text-2xl font-bold tracking-tight">{t(b.text, locale)}</h2>;
          case "text":
            return <div key={i} className="space-y-3 text-[15px] leading-relaxed">{t(b.body, locale).split(/\n{2,}/).map((para, j) => <p key={j} className="whitespace-pre-line">{para}</p>)}</div>;
          case "image":
            return b.url ? (
              <figure key={i}>
                <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-surface-2"><Image src={b.url} alt={t(b.caption, locale)} fill sizes="(min-width: 896px) 896px, 100vw" className="object-cover" /></div>
                {t(b.caption, locale) && <figcaption className="mt-2 text-sm text-muted">{t(b.caption, locale)}</figcaption>}
              </figure>
            ) : null;
          case "button":
            return <div key={i}><Link href={safeHref(b.href)} className="btn-primary">{t(b.label, locale)}</Link></div>;
          case "faq":
            return (
              <div key={i} className="divide-y divide-border rounded-2xl border border-border bg-surface">
                {b.items.map((it, j) => (
                  <details key={j} className="p-5"><summary className="cursor-pointer font-semibold">{t(it.q, locale)}</summary><p className="mt-2 whitespace-pre-line text-muted">{t(it.a, locale)}</p></details>
                ))}
              </div>
            );
          case "products":
            // HaitiViral has no shop grid: a "products" block on a custom page links to the order screen.
            return productLists[i]?.length ? <Link key={i} href="/order" className="btn-primary inline-flex min-h-11 px-5">{tc("tabOrder")}</Link> : null;
        }
      })}
    </div>
  );
}
