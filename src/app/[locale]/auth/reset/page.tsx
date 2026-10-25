import { AuthShell } from "@/components/AuthShell";
import { PageBar } from "@/components/PageBar";
import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ResetForm } from "@/components/ResetForm";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("resetTitle"), robots: { index: false } };
}

export default async function ResetPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  return (
    <AuthShell>
      <PageBar title={(await getTranslations("auth"))("resetTitle")} back="/auth/login" backLabel={(await getTranslations("common"))("back")} />
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
