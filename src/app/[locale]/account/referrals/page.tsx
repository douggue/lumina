import { siteUrl } from "@/lib/site-url";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { earningsBalance, ensureReferralCode, referralStats } from "@/lib/referrals";
import { formatMoney } from "@/lib/money";
import { t as txt } from "@/lib/text";
import { PageBar } from "@/components/PageBar";
import { Link } from "@/i18n/navigation";
import { EarningsCard, ReferralLists, ShareBox, TierCard } from "@/components/ReferralClient";

/** Invite friends, customer side (mockup "Referral: customer"): tier, earnings and withdrawals, link, friends. */
export default async function ReferralsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const [t, tr, tc, settings] = await Promise.all([getTranslations("refUi"), getTranslations("referrals"), getTranslations("common"), getSettings()]);
  const bar = <PageBar title={tr("title")} back="/account" backLabel={tc("back")} right={<Link href="/referral" className="px-1.5 text-[13px] font-bold text-primary">{t("how")}</Link>} />;
  if (!settings.referralEnabled) {
    return (
      <>
        {bar}
        <p className="mx-auto max-w-[560px] px-5 py-10 text-center text-muted">{t("off")}</p>
      </>
    );
  }
  const code = await ensureReferralCode(user.id);
  const link = `${siteUrl()}/r/${code}`;
  const [stats, money, earnedTotal, refs, commissions, payouts, me] = await Promise.all([
    referralStats(user.id, settings),
    earningsBalance(user.id),
    prisma.referralCommission.aggregate({ where: { referrerId: user.id, status: "AVAILABLE" }, _sum: { amount: true } }),
    prisma.referral.findMany({ where: { referrerId: user.id }, orderBy: { createdAt: "desc" }, take: 100, include: { referred: { select: { name: true } } } }),
    prisma.referralCommission.groupBy({ by: ["referredId"], where: { referrerId: user.id, status: { in: ["AVAILABLE", "PENDING"] } }, _sum: { amount: true }, _count: true }),
    prisma.payout.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, phone: true } }),
  ]);
  const fmt = (n: number) => formatMoney(n, "HTG", locale);
  const mask = (name: string) => name.split(" ").map((p, i) => (i === 0 ? p : `${p[0] ?? ""}.`)).join(" ");
  const when = (d: Date) => d.toLocaleDateString(locale === "fr" ? "fr-FR" : "fr-HT", { day: "numeric", month: "short" });

  const next = stats.next;
  const needActive = next ? Math.max(0, next.minActive - stats.active) : 0;
  const needVolume = next ? Math.max(0, next.minVolume - stats.volume) : 0;
  const progress = next ? Math.min(100, Math.round(Math.max(next.minActive ? stats.active / next.minActive : 0, next.minVolume ? stats.volume / next.minVolume : 0) * 100)) : 100;

  return (
    <>
      {bar}
      <div className="mx-auto flex max-w-[560px] flex-col gap-4 px-5 py-[18px]">
        <TierCard
          title={t("yourTier")}
          name={`${txt(stats.tier.name, locale)} · ${stats.tier.pct}%`}
          window={t("last30")}
          line={next ? t("progressLine", { n: stats.active, of: next.minActive, next: `${txt(next.name, locale)} · ${next.pct}%` }) : t("topTier")}
          need={next ? t.rich("tierGap", { friends: needActive, amount: fmt(needVolume), next: txt(next.name, locale), b: (c) => <b className="text-[#FBBF24]">{c}</b> }) : null}
          progress={progress}
          showLabel={t("showTiers")}
          hideLabel={t("hideTiers")}
          tiers={stats.tiers.map((x) => ({ key: x.key, name: txt(x.name, locale), pct: x.pct, need: x.minActive || x.minVolume ? t("tierNeed", { n: x.minActive, amount: fmt(x.minVolume) }) : t("tierStart"), current: x.key === stats.tier.key }))}
        />

        <EarningsCard available={money.available} pending={money.pending} min={settings.refMinPayoutHtg} name={me.name} phone={me.phone ?? ""} />

        <section className="grid grid-cols-3 gap-2">
          {[
            [String(stats.invited), t("statInvited"), ""],
            [String(stats.active), t("statActive"), "text-primary"],
            [fmt(earnedTotal._sum.amount ?? 0), t("statEarned"), "text-success"],
          ].map(([v, l, c]) => (
            <div key={l} className="flex flex-col items-center gap-1 rounded-[14px] border border-border bg-surface px-2 py-3 text-center">
              <span className={`text-lg font-extrabold ${c}`}>{v}</span>
              <span className="text-[11px] font-semibold text-muted">{l}</span>
            </div>
          ))}
        </section>

        <ShareBox link={link} message={tr("shareText", { link })} />

        <ReferralLists
          friendsLabel={t("tabFriends")}
          payoutsLabel={t("tabPayouts")}
          emptyFriends={t("noFriends")}
          emptyPayouts={t("noPayouts")}
          friends={refs.map((r) => {
            const c = commissions.find((x) => x.referredId === r.referredId);
            return {
              id: r.id,
              initial: (r.referred.name[0] ?? "?").toUpperCase(),
              name: mask(r.referred.name),
              meta: r.status === "REJECTED" ? t("friendBlocked") : c ? t("friendActive", { n: c._count }) : t("friendNoOrder"),
              value: r.status === "REJECTED" ? "—" : `+ ${fmt(c?._sum.amount ?? 0)}`,
              tone: r.status === "REJECTED" ? "bad" : c ? "good" : "muted",
            } as const;
          })}
          payouts={payouts.map((p) => ({
            id: p.id,
            initial: p.method === "MONCASH" ? "M" : "N",
            name: `${fmt(p.amount)} · ${p.method === "MONCASH" ? "MonCash" : "NatCash"}`,
            meta: `${when(p.createdAt)} · ${p.phone.replace(/(\d{4})$/, "••••")}`,
            value: p.status === "SENT" ? t("paySent") : p.status === "REJECTED" ? t("payRejected") : t("payWaiting"),
            tone: p.status === "SENT" ? "good" : p.status === "REJECTED" ? "bad" : "muted",
          } as const))}
        />

        <p className="text-xs leading-normal text-muted">{t("rules", { days: settings.refHoldDays })}</p>
      </div>
    </>
  );
}
