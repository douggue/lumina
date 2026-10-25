import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { CommunityBar } from "@/components/CommunityBar";
import { t as txt } from "@/lib/text";
import { vipStatus } from "@/lib/vip";
import { emailEnabled } from "@/lib/email";
import { VerifyEmailBanner } from "@/components/VerifyEmailBanner";
import { LangSegment, SignOutButton, ThemeSegment } from "@/components/HeaderClient";
import { PushSwitch } from "@/components/PushToggle";
import { MarketingSwitch } from "@/components/AccountSwitches";

const Chevron = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="9 18 15 12 9 6" /></svg>
);

/** Account (mockup "Kont"): profile, VIP level, settings switches, links, sign out. */
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const [t, settings, vip, google, prefsRow] = await Promise.all([
    getTranslations("accountUi"),
    getSettings(),
    vipStatus(user.id),
    prisma.account.findFirst({ where: { userId: user.id, providerId: "google" }, select: { id: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { notifyPrefs: true } }),
  ]);
  const marketing = !!((prefsRow.notifyPrefs ?? {}) as Record<string, boolean>).marketing;
  const pct = vip.next ? Math.min(100, Math.round(((vip.spent - vip.level.min) / (vip.next.min - vip.level.min)) * 100)) : 100;
  const row = "flex min-h-[54px] items-center justify-between border-b border-border text-sm font-semibold text-text last:border-0";
  const links = [
    ...(settings.referralEnabled ? [{ href: "/account/referrals", label: t("invite") }] : []),
    { href: "/help", label: t("support") },
    { href: "/account/wallet", label: t("walletHistory") },
    { href: "/account/profile", label: t("profile") },
    { href: "/account/security", label: t("security") },
    { href: "/account/privacy", label: t("privacy") },
    { href: "/terms", label: t("terms") },
  ];

  return (
    <>
      <header className="flex items-center gap-3 border-b border-border bg-surface px-5 py-4">
        <span className="grid h-12 w-12 flex-none place-items-center overflow-hidden rounded-full bg-text text-lg font-extrabold text-surface">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" className="h-full w-full object-cover" />
          ) : (
            user.name.trim()[0]?.toUpperCase()
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <h1 className="truncate text-lg font-extrabold">{user.name}</h1>
          <span className="truncate text-xs text-muted">{user.email}{google ? ` · ${t("google")}` : ""}</span>
        </span>
      </header>

      <div className="mx-auto flex max-w-[560px] flex-col gap-4 px-5 py-4">
        {!user.emailVerified && emailEnabled() && <VerifyEmailBanner email={user.email} />}

        <section className="flex flex-col gap-2.5 rounded-[18px] bg-[#0F172A] p-4 text-white">
          <div className="flex items-center justify-between">
            <span className="flex flex-col gap-0.5">
              <span className="text-xs text-[#CBD5E1]">{t("vipLevel")}</span>
              <span className="text-xl font-extrabold">
                {vip.level.discount ? t("vipName", { name: txt(vip.level.name, locale), discount: vip.level.discount }) : t("vipNameNone", { name: txt(vip.level.name, locale) })}
              </span>
            </span>
            <span className="rounded-full bg-surface-2 px-2.5 py-[5px] text-xs font-extrabold text-text">VIP</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#334155]"><div className="h-full rounded-full bg-[#FBBF24]" style={{ width: `${pct}%` }} /></div>
          <p className="text-xs text-[#CBD5E1]">
            {vip.next
              ? t.rich("vipNext", { amount: formatMoney(vip.next.min - vip.spent, "HTG", locale), name: txt(vip.next.name, locale), discount: vip.next.discount, b: (c) => <b className="text-[#FBBF24]">{c}</b> })
              : t("vipTop")}
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-surface px-3.5 py-1">
          <div className="flex min-h-[54px] items-center justify-between border-b border-border">
            <span className="text-sm font-semibold">{t("language")}</span>
            <LangSegment full />
          </div>
          <div className="flex min-h-[54px] items-center justify-between border-b border-border">
            <span className="text-sm font-semibold">{t("theme")}</span>
            <ThemeSegment />
          </div>
          <PushSwitch label={t("orderNotifs")} sub={t("orderNotifsSub")} />
          <MarketingSwitch initial={marketing} label={t("promos")} sub={t("promosSub")} />
          <Link href="/account/security" className="flex min-h-[54px] items-center justify-between border-b border-border text-text">
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{t("twofa")}</span>
              <span className="text-xs text-muted">{t("twofaSub")}</span>
            </span>
            <span className={`text-xs font-bold ${user.twoFactorEnabled ? "text-success" : "text-muted"}`}>{user.twoFactorEnabled ? t("on") : t("off")}</span>
          </Link>
          <Link href="/account/notifications" className={row}>{t("install")}<Chevron /></Link>
        </section>

        <section className="rounded-2xl border border-border bg-surface px-3.5 py-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={row}>{l.label}<Chevron /></Link>
          ))}
          <SignOutButton className="flex min-h-[54px] w-full items-center gap-2 text-sm font-bold text-danger" />
        </section>
        <CommunityBar settings={settings} label={t("community")} />
      </div>
    </>
  );
}
