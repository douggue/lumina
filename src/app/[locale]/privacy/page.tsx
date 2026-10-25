import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContentPage } from "@/components/ContentPage";
import { pageSeo } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages" });
  return pageSeo(locale, "/privacy", t("privacyTitle"));
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const t = await getTranslations("pages");
  const paragraphs = t.raw("privacyBody") as string[];
  return (
    <ContentPage title={t("privacyTitle")}>
      <ol className="list-decimal space-y-3 pl-5">
        {paragraphs.map((p, i) => <li key={i}>{p}</li>)}
      </ol>
    </ContentPage>
  );
}
