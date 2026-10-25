import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContentPage } from "@/components/ContentPage";
import { pageSeo } from "@/lib/seo";
import { getDisplaySettings } from "@/lib/settings";
import { PayLogo } from "@/components/PayLogo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pages" });
  return pageSeo(locale, "/guides", t("guidesTitle"));
}

export default async function GuidesPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const [t, s] = await Promise.all([getTranslations("pages"), getDisplaySettings()]);
  const guides = [
    { id: "moncash", title: t("guideMoncashTitle"), steps: t.raw("guideMoncash") as string[], badge: <PayLogo brand="moncash" height={26} /> },
    { id: "natcash", title: t("guideNatcashTitle"), steps: t.raw("guideNatcash") as string[], badge: <PayLogo brand="natcash" height={26} />, extra: `${s.natcashRecipientName} · ${s.natcashRecipientPhone}` },
    { id: "copy-link", title: t("guidePlayerIdTitle"), steps: t.raw("guidePlayerId") as string[], badge: <span aria-hidden>🔗</span> },
  ];
  return (
    <ContentPage title={t("guidesTitle")}>
      <nav className="flex flex-wrap gap-2">
        {guides.map((g) => <a key={g.id} href={`#${g.id}`} className="badge border border-border bg-surface px-3 py-1.5">{g.title}</a>)}
      </nav>
      {guides.map((g) => (
        <section key={g.id} id={g.id} className="card scroll-mt-24 p-5 sm:p-6">
          <h2 className="flex items-center gap-3 text-xl font-bold">{g.badge} {g.title}</h2>
          {g.extra && <p className="mt-2 font-mono text-sm font-semibold">{g.extra}</p>}
          <ol className="mt-4 space-y-3">
            {g.steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-white">{i + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </ContentPage>
  );
}
