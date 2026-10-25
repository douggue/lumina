import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getUser } from "@/lib/session";
import { getDisplaySettings } from "@/lib/settings";
import { CommunityBar } from "@/components/CommunityBar";
import { prisma } from "@/lib/db";
import { t as txt } from "@/lib/text";
import { PLATFORMS } from "@/lib/services";
import { PageBar } from "@/components/PageBar";
import { WhatsAppIcon } from "@/components/Icons";
import { Faq, OrderLookup } from "@/components/HelpClient";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: (await getTranslations({ locale, namespace: "helpUi" }))("title") };
}

const LOOK = { ok: ["#DCFCE7", "#166534", "#16A34A"], slow: ["#FEF3C7", "#92400E", "#D97706"], pause: ["#FEE2E2", "#991B1B", "#DC2626"] } as const;

/** Help (mockup "Sipò"): WhatsApp, support ticket, order lookup, services status, frequent questions. */
export default async function HelpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tc, user, settings, platforms] = await Promise.all([
    getTranslations("helpUi"),
    getTranslations("common"),
    getUser(),
    getDisplaySettings(),
    prisma.category.findMany({ where: { isVisible: true, slug: { in: Object.keys(PLATFORMS) } }, orderBy: { sortOrder: "asc" } }),
  ]);
  const wa = `https://wa.me/${settings.whatsappNumber}?text=${encodeURIComponent(tc("whatsappMessage"))}`;
  return (
    <>
      <PageBar title={t("title")} back={user ? "/account" : "/"} backLabel={tc("back")} />
      <div className="mx-auto flex max-w-[560px] flex-col gap-4 px-5 py-4">
        <div className="grid grid-cols-2 gap-2.5">
          <a href={wa} target="_blank" rel="noopener" className="flex min-h-[54px] items-center justify-center gap-2 rounded-[14px] bg-[#15803D] text-[15px] font-bold text-white">
            <WhatsAppIcon width={20} height={20} />{t("whatsapp")}
          </a>
          <Link href={user ? "/account/support" : "/auth/login?next=/account/support"} className="flex min-h-[54px] items-center justify-center gap-2 rounded-[14px] border border-[#CBD2E1] bg-surface text-[15px] font-bold text-text dark:border-border">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 4h16v12H8l-4 4z" /></svg>{t("ticket")}
          </Link>
        </div>

        <OrderLookup signedIn={!!user} />

        <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3.5">
          <h2 className="text-[15px] font-bold">{t("statusTitle")}</h2>
          {platforms.map((p) => {
            const s = settings.serviceStatus?.[p.slug] ?? "ok";
            const [bg, fg, dot] = LOOK[s];
            return (
              <div key={p.id} className="flex items-center justify-between py-1.5">
                <span className="text-sm font-semibold">{txt(p.name, locale)}</span>
                <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: bg, color: fg }}>
                  <span className="h-[7px] w-[7px] rounded-full" style={{ background: dot }} />{t(s)}
                </span>
              </div>
            );
          })}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-bold">{t("faqTitle")}</h2>
          <Faq items={[1, 2, 3, 4].map((i) => ({ q: t(`q${i}`), a: t(`a${i}`) }))} />
        </section>
        <CommunityBar settings={settings} label={tc("community")} />
      </div>
    </>
  );
}
