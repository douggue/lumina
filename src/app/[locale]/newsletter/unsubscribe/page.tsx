import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { ContentPage } from "@/components/ContentPage";

export const metadata = { robots: { index: false } };

/** One-click unsubscribe from the link in every newsletter email (?t=token). */
export default async function Unsubscribe({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ t?: string }> }) {
  setRequestLocale((await params).locale);
  const { t: token } = await searchParams;
  if (token) await prisma.newsletterSubscriber.updateMany({ where: { token, unsubscribedAt: null }, data: { unsubscribedAt: new Date() } });
  const t = await getTranslations("newsletter");
  return <ContentPage title={t("title")}><p>{t("unsubscribed")}</p></ContentPage>;
}
