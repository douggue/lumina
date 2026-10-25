import { AuthShell } from "@/components/AuthShell";
import { PageBar } from "@/components/PageBar";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { emailEnabled } from "@/lib/email";
import { getDisplaySettings } from "@/lib/settings";
import { ForgotForm } from "@/components/ForgotForm";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("forgotTitle"), robots: { index: false } };
}

export default async function ForgotPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const settings = await getDisplaySettings();
  return (
    <AuthShell>
      <PageBar title={(await getTranslations("auth"))("forgotTitle")} back="/auth/login" backLabel={(await getTranslations("common"))("back")} />
      <ForgotForm emailEnabled={emailEnabled()} whatsappNumber={settings.whatsappNumber} />
    </AuthShell>
  );
}
