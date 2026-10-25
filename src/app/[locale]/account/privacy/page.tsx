import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { DeleteAccountForm } from "@/components/PrivacyForms";

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const hasPassword = (await prisma.account.count({ where: { userId: user.id, providerId: "credential" } })) > 0;
  const t = await getTranslations("privacy");
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">{t("exportTitle")}</h2>
        <p className="text-sm text-muted">{t("exportBody")}</p>
        <a href="/api/account/export" className="btn-secondary">{t("exportButton")}</a>
      </section>
      <DeleteAccountForm hasPassword={hasPassword} />
    </div>
  );
}
