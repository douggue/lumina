import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getUser } from "@/lib/session";
import { getDisplaySettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { t as txt } from "@/lib/text";
import { Link } from "@/i18n/navigation";
import { PayBadges } from "@/components/PayLogo";
import { EarningsCalculator, RefFaq } from "@/components/ReferralPublic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "refPublic" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

/** Referral program, public page (mockup "Referral: visitor"): earn on friends' orders, withdraw to MonCash/NatCash. */
export default async function ReferralPublicPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, user, s] = await Promise.all([getTranslations("refPublic"), getUser(), getDisplaySettings()]);
  const tiers = [...s.refTiers].sort((a, b) => a.pct - b.pct);
  const top = tiers[tiers.length - 1]?.pct ?? 0;
  const fmt = (n: number) => formatMoney(n, "HTG", locale);
  const cta = user ? { href: "/account/referrals", label: t("ctaMine") } : { href: "/auth/register?next=/account/referrals", label: t("ctaJoin") };
  const DOT = ["#B45309", "#94A3B8", "#EAB308", "#0EA5E9"];
  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-[22px] px-5 pb-8 pt-5">
      <section className="relative flex flex-col gap-3.5 overflow-hidden rounded-[22px] bg-[#00209F] px-5 py-[22px] text-white">
        <div aria-hidden className="absolute -right-10 -top-10 h-[150px] w-[150px] rounded-full bg-[#D21034]" />
        <span className="relative text-xs font-extrabold tracking-[0.6px] text-[#DCE3FF]">{t("eyebrow")}</span>
        <h1 className="relative max-w-[290px] text-[27px] font-extrabold leading-[1.18]">{t("title")}</h1>
        <p className="relative text-[15px] leading-normal text-[#E5EAFF]">{t.rich("lead", { pct: top, b: (c) => <b className="text-white">{c}</b> })}</p>
        <PayBadges className="relative" />
        <Link href={cta.href} className="relative flex min-h-[52px] items-center justify-center rounded-[14px] bg-white text-base font-extrabold text-[#00209F] dark:bg-white dark:text-[#00209F]">{cta.label}</Link>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-lg font-extrabold">{t("howTitle")}</h2>
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-start gap-3 rounded-[14px] border border-border bg-surface p-3.5">
            <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-text text-[15px] font-extrabold text-surface">{n}</span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-extrabold">{t(`step${n}Title`)}</span>
              <span className="text-[13px] leading-snug text-muted">{t(`step${n}Text`)}</span>
            </span>
          </div>
        ))}
      </section>

      <EarningsCalculator tiers={tiers.map((x) => ({ name: txt(x.name, locale), pct: x.pct, minActive: x.minActive }))} />

      <section className="flex flex-col gap-2.5">
        <h2 className="text-lg font-extrabold">{t("tiersTitle")}</h2>
        {tiers.map((x, i) => (
          <div key={x.key} className="flex items-center gap-3 rounded-[14px] border border-border bg-surface px-3.5 py-3">
            <span className="h-3.5 w-3.5 flex-none rounded-full" style={{ background: DOT[i] ?? "#94A3B8" }} />
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-extrabold">{txt(x.name, locale)}</span>
              <span className="text-xs text-muted">{x.minActive || x.minVolume ? t("tierNeed", { n: x.minActive, amount: fmt(x.minVolume) }) : t("tierStart")}</span>
            </span>
            <span className="text-xl font-extrabold text-[#00209F] dark:text-primary">{x.pct}%</span>
          </div>
        ))}
        <p className="text-xs text-muted">{t("tiersNote")}</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-extrabold">{t("faqTitle")}</h2>
        <RefFaq items={[1, 2, 3, 4].map((i) => ({ q: t(`q${i}`), a: t(`a${i}`, { min: fmt(s.refMinPayoutHtg), days: s.refHoldDays }) }))} />
      </section>

      <section className="flex flex-col gap-3 rounded-[20px] bg-[#0F172A] p-5 text-center dark:border dark:border-border dark:bg-surface-2 text-white">
        <span className="text-xl font-extrabold">{t("endTitle")}</span>
        <span className="text-sm text-[#CBD5E1]">{t("endText")}</span>
        <Link href={cta.href} className="flex min-h-[52px] items-center justify-center keep-white rounded-[14px] bg-white text-base font-extrabold text-[#0F172A]">{cta.label}</Link>
        {!user && <Link href="/auth/login?next=/account/referrals" className="p-2 text-sm font-bold text-[#CBD5E1]">{t("haveAccount")}</Link>}
      </section>
    </div>
  );
}
