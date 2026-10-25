import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContentPage } from "@/components/ContentPage";
import { pageSeo } from "@/lib/seo";
import { getDisplaySettings } from "@/lib/settings";
import { WhatsAppIcon } from "@/components/Icons";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages" });
  return pageSeo(locale, "/contact", t("contactTitle"));
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const [t, tc, s] = await Promise.all([getTranslations("pages"), getTranslations("common"), getDisplaySettings()]);
  return (
    <ContentPage title={t("contactTitle")}>
      <p className="text-muted">{t("contactBody")}</p>
      <a href={`https://wa.me/${s.whatsappNumber}?text=${encodeURIComponent(tc("whatsappMessage"))}`} target="_blank" rel="noopener" className="btn min-h-12 bg-[#1fa855] text-white hover:bg-[#178a45]">
        <WhatsAppIcon /> {tc("whatsappHelp")}
      </a>
      <dl className="card grid gap-4 p-5 sm:grid-cols-2">
        <div><dt className="text-sm text-muted">{t("address")}</dt><dd className="font-medium">{s.businessName}, {s.businessAddress}</dd></div>
        <div><dt className="text-sm text-muted">{t("hours")}</dt><dd className="font-medium">{s.supportHours}</dd></div>
        <div><dt className="text-sm text-muted">WhatsApp</dt><dd className="font-medium">+{s.whatsappNumber}</dd></div>
      </dl>
    </ContentPage>
  );
}
