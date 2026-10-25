import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContentPage } from "@/components/ContentPage";
import { pageSeo } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages" });
  return pageSeo(locale, "/faq", t("faqTitle"));
}

export default async function FaqPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const [t, tf] = await Promise.all([getTranslations("pages"), getTranslations("faq")]);
  const items = [1, 2, 3, 4].map((i) => ({ q: tf(`q${i}`), a: tf(`a${i}`) }));
  const jsonLd = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })) };
  return (
    <ContentPage title={t("faqTitle")}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
        {items.map((i) => (
          <details key={i.q} className="p-5" open>
            <summary className="cursor-pointer font-semibold">{i.q}</summary>
            <p className="mt-2 text-muted">{i.a}</p>
          </details>
        ))}
      </div>
    </ContentPage>
  );
}
