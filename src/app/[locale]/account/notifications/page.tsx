import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { markNotificationsRead } from "@/actions/account";
import { PageBar } from "@/components/PageBar";
import { InstallCard } from "@/components/InstallCard";

const KIND: Record<string, [bg: string, fg: string, icon: string]> = {
  ok: ["#DCFCE7", "#166534", "✓"],
  money: ["#DBEAFE", "#1E40AF", "+"],
  refund: ["#FEF3C7", "#92400E", "↺"],
  warn: ["#FEE2E2", "#991B1B", "!"],
  promo: ["#FCE7F3", "#9D174D", "%"],
};
const KIND_OF: Record<string, keyof typeof KIND> = {
  order_fulfilled: "ok", order_paid: "ok", deposit_approved: "money", wallet_adjusted: "money", referral_rewarded: "money", exchange_done: "money", payout_sent: "money", payout_rejected: "warn", order_partial: "refund",
  order_refunded: "refund", deposit_held: "refund", deposit_rejected: "warn",
};

/** Notifications (mockup "Notifikasyon"): install card, then one card per notification with an icon by kind. */
export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const [tn, t, tc] = await Promise.all([getTranslations("notifications"), getTranslations("notifUi"), getTranslations("common")]);
  const now = Date.now();
  const when = (d: Date) => {
    const min = Math.floor((now - d.getTime()) / 60000);
    if (min < 1) return t("justNow");
    if (min < 60) return t("minutesAgo", { n: min });
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (new Date(now).toDateString() === d.toDateString()) return t("today", { time });
    if (new Date(now - 86400000).toDateString() === d.toDateString()) return t("yesterday");
    return d.toLocaleDateString(locale === "fr" ? "fr-FR" : "fr-HT", { day: "numeric", month: "short" });
  };
  const items = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 });
  const render = (type: string, params: Record<string, string | number>) => {
    const p = { ...params };
    if (typeof p.amount === "number") p.amount = formatMoney(p.amount, (p.currency as "HTG" | "USD") ?? "HTG", locale);
    delete p.currency;
    return tn.has(type) ? tn(type, p) : type;
  };
  return (
    <>
      <PageBar
        title={tn("title")}
        back="/"
        backLabel={tc("back")}
        right={items.some((i) => !i.readAt) && (
          <form action={markNotificationsRead}><button className="min-h-11 px-2.5 text-[13px] font-bold text-primary">{t("markAll")}</button></form>
        )}
      />
      <div className="mx-auto flex max-w-[560px] flex-col gap-2.5 px-5 py-4">
        <InstallCard title={t("installTitle")} body={t("installBody")} />
        {items.length === 0 && <p className="py-8 text-center text-sm text-muted">{tn("empty")}</p>}
        {items.map((n) => {
          const [bg, fg, icon] = KIND[KIND_OF[n.type] ?? "promo"];
          const unread = !n.readAt;
          const inner = (
            <>
              <span className="grid h-10 w-10 flex-none place-items-center rounded-xl text-base font-extrabold" style={{ background: bg, color: fg }} aria-hidden>{icon}</span>
              <span className="flex flex-1 flex-col gap-[3px]">
                <span className="text-sm font-bold">{t.has(n.type) ? t(n.type) : t("other")}</span>
                <span className="text-[13px] leading-snug text-text/80">{render(n.type, n.params as Record<string, string | number>)}</span>
                <span className="text-[11px] text-muted">{when(n.createdAt)}</span>
              </span>
            </>
          );
          const cls = `flex gap-3 rounded-[14px] bg-surface px-3.5 py-3 text-text ${unread ? "border border-primary/40 shadow-[inset_3px_0_0_var(--text)]" : "border border-border"}`;
          return n.link ? <Link key={n.id} href={n.link} className={cls}>{inner}</Link> : <div key={n.id} className={cls}>{inner}</div>;
        })}
      </div>
    </>
  );
}
