import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { t as txt } from "@/lib/text";
import { trialOffers } from "@/lib/trials";
import { PageBar } from "@/components/PageBar";
import { TrialForm } from "@/components/TrialForm";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "trialUi" }))("title") };
}

export default async function TrialPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tc, user, settings, offers] = await Promise.all([getTranslations("trialUi"), getTranslations("common"), getUser(), getSettings(), trialOffers()]);
  return (
    <>
      <PageBar title={t("title")} back="/" backLabel={tc("back")} />
      <div className="mx-auto max-w-[560px] px-5 py-[18px]">
        {settings.trialEnabled && offers.length ? (
          <TrialForm signedIn={!!user} offers={offers.map((o) => ({ key: o.key, label: txt(o.label, locale), avg: txt(o.avg, locale), platform: o.platform, post: o.post }))} />
        ) : (
          <p className="py-10 text-center text-muted">{t("error_off")}</p>
        )}
      </div>
    </>
  );
}
