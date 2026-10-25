import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getBalances } from "@/lib/ledger";
import { isStaff } from "@/lib/permissions";
import { getDisplaySettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { Logo } from "./Logo";
import { BellIcon } from "./Icons";
import { LangToggle } from "./HeaderClient";

/** Top bar as in the mockup: logo · language · notifications · wallet balance (or sign in). Wider screens also get the main links. */
export async function Header() {
  const t = await getTranslations("common");
  const locale = await getLocale();
  const [user, settings] = await Promise.all([getUser(), getDisplaySettings()]);
  const [unread, balances] = user
    ? await Promise.all([prisma.notification.count({ where: { userId: user.id, readAt: null } }), getBalances(prisma, user.id)])
    : [0, null];
  const links = [
    { href: "/", label: t("home") },
    { href: "/order", label: t("tabOrder") },
    { href: "/account/orders", label: t("tabOrders") },
    { href: "/account/wallet", label: t("wallet") },
  ];

  return (
    <header className="border-b border-border bg-surface">
      <div className="container-page flex h-16 items-center gap-1.5">
        <Link href="/" className="shrink-0">
          <Logo src={settings.logoUrl} darkSrc={settings.logoDarkUrl} alt={settings.businessName} />
        </Link>
        <nav aria-label={t("menu")} className="ml-6 hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-[10px] px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-text">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <LangToggle />
          {user && (
            <Link href="/account/notifications" className="relative grid h-11 w-11 place-items-center rounded-[10px] text-text hover:bg-surface-2" aria-label={`${t("notifications")} (${unread})`}>
              <BellIcon width={21} height={21} strokeWidth={2} />
              {unread > 0 && <span className="absolute right-2.5 top-2 h-[9px] w-[9px] rounded-full border-2 border-surface bg-[#D21034]" />}
            </Link>
          )}
          {balances ? (
            <Link href="/account/wallet" className="ml-1 inline-flex h-10 items-center rounded-full bg-primary-soft px-3 text-[13px] font-bold text-primary dark:text-text" aria-label={t("balance")}>
              {formatMoney(balances.HTG.available, "HTG", locale)}
            </Link>
          ) : (
            <Link href="/auth/login" className="btn-primary ml-1 min-h-10 rounded-full px-4 text-[13px]">
              {t("signIn")}
            </Link>
          )}
          {user && isStaff(user.role) && (
            <a href="/admin" className="btn-secondary ml-1 hidden min-h-10 lg:inline-flex">{t("admin")}</a>
          )}
        </div>
      </div>
    </header>
  );
}
