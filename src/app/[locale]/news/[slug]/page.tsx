import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { formatDate, t } from "@/lib/text";
import { alternates } from "@/lib/seo";
import { Link } from "@/i18n/navigation";

type P = Promise<{ locale: string; slug: string }>;
const load = (slug: string) => prisma.newsArticle.findFirst({ where: { slug, isPublished: true, publishedAt: { lte: new Date() } } });

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const { locale, slug } = await params;
  const a = await load(slug);
  if (!a) return {};
  const title = t(a.title, locale);
  const description = t(a.excerpt, locale);
  return { title, description, alternates: alternates(locale, `/news/${slug}`), openGraph: { type: "article", title, description, ...(a.image ? { images: [a.image] } : {}) } };
}

export default async function ArticlePage({ params }: { params: P }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const a = await load(slug);
  if (!a) notFound();
  const tn = await getTranslations("news");
  const title = t(a.title, locale);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    datePublished: a.publishedAt?.toISOString(),
    dateModified: a.updatedAt.toISOString(),
    ...(a.image ? { image: [a.image] } : {}),
  };
  return (
    <article className="container-page max-w-3xl py-8 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Link href="/news" className="text-sm text-muted hover:text-text">← {tn("back")}</Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      {a.publishedAt && <time className="mt-2 block text-sm text-muted" dateTime={a.publishedAt.toISOString()}>{formatDate(a.publishedAt, locale, "long")}</time>}
      {a.image && (
        <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-2xl bg-surface-2">
          <Image src={a.image} alt="" fill priority sizes="(min-width: 768px) 768px, 100vw" className="object-cover" />
        </div>
      )}
      {/* Plain text with paragraphs: no HTML is ever rendered from the editor. */}
      <div className="mt-6 space-y-4 text-[15px] leading-relaxed">
        {t(a.body, locale).split(/\n{2,}/).map((para, i) => <p key={i} className="whitespace-pre-line">{para}</p>)}
      </div>
    </article>
  );
}
