import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { pageSeo } from "@/lib/seo";
import { NewsCard } from "@/components/NewsCard";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "news" });
  return pageSeo(locale, "/news", t("title"), t("subtitle"));
}

export default async function NewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, articles] = await Promise.all([
    getTranslations("news"),
    prisma.newsArticle.findMany({ where: { isPublished: true, publishedAt: { lte: new Date() } }, orderBy: { publishedAt: "desc" }, take: 60 }),
  ]);
  return (
    <div className="container-page py-8 sm:py-12">
      <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
      <p className="mt-1 text-muted">{t("subtitle")}</p>
      {articles.length === 0 ? (
        <div className="card mt-6 p-10 text-center text-muted">{t("empty")}</div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{articles.map((a) => <NewsCard key={a.id} article={a} locale={locale} />)}</div>
      )}
    </div>
  );
}
