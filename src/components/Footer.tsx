import { unstable_cache } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Settings } from "@/lib/settings";
import { Logo } from "./Logo";
import { PinIcon } from "./Icons";
import { DataSaverToggle } from "./DataSaverToggle";
import { InstallLink } from "./InstallPrompt";
import { NewsletterForm } from "./NewsletterForm";
import { prisma } from "@/lib/db";
import { t as txt } from "@/lib/text";
import { getLocale } from "next-intl/server";
import { PayBadges } from "./PayLogo";
import { CommunityBar } from "./CommunityBar";

const footerPages = unstable_cache(
  () => prisma.page.findMany({ where: { isPublished: true, showInFooter: true }, select: { slug: true, title: true }, orderBy: { createdAt: "asc" } }),
  ["footer-pages"],
  { tags: ["pages"], revalidate: 300 },
);

export async function Footer({ settings }: { settings: Settings }) {
  const t = await getTranslations("common");
  const tp = await getTranslations("pages");
  const locale = await getLocale();
  const pages = await footerPages();
  const extra = settings.navigation?.footer ?? [];

  return (
    <footer className="mt-20 border-t border-border bg-surface">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo src={settings.logoUrl} darkSrc={settings.logoDarkUrl} alt={settings.businessName} />
          <p className="text-sm text-muted">{t("footerTagline")}</p>
          <PayBadges />
          <p className="flex items-start gap-2 text-sm text-muted">
            <PinIcon width={16} height={16} className="mt-0.5 shrink-0" />
            <span>
              {settings.businessName} · {settings.businessAddress}
            </span>
          </p>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">{t("store")}</h2>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link href="/order" className="hover:text-text">{t("tabOrder")}</Link></li>
            <li><Link href="/trial" className="hover:text-text">{t("freeTrial")}</Link></li>
            <li><Link href="/guides" className="hover:text-text">{t("guides")}</Link></li>
            <li><Link href="/news" className="hover:text-text">{t("news")}</Link></li>
            <li><Link href="/account/wallet" className="hover:text-text">{t("wallet")}</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">{t("help")}</h2>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link href="/faq" className="hover:text-text">{t("faq")}</Link></li>
            <li><Link href="/contact" className="hover:text-text">{t("contact")}</Link></li>
            <li><Link href="/about" className="hover:text-text">{t("about")}</Link></li>
            <li>
              <a href={`https://wa.me/${settings.whatsappNumber}`} className="hover:text-text" rel="noopener" target="_blank">
                {t("whatsappHelp")}
              </a>
            </li>
            <li>{tp("hours")}: {settings.supportHours}</li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold">Legal</h2>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link href="/terms" className="hover:text-text">{t("terms")}</Link></li>
            <li><Link href="/privacy" className="hover:text-text">{t("privacy")}</Link></li>
            <li><Link href="/refunds" className="hover:text-text">{t("refunds")}</Link></li>
            {pages.map((p) => <li key={p.slug}><Link href={`/p/${p.slug}`} className="hover:text-text">{txt(p.title, locale)}</Link></li>)}
            {extra.map((l) => <li key={l.href}>{l.href.startsWith("https://") ? <a href={l.href} rel="noopener" target="_blank" className="hover:text-text">{txt(l.label, locale)}</a> : <Link href={l.href} className="hover:text-text">{txt(l.label, locale)}</Link>}</li>)}
          </ul>
          {[settings.socialWhatsappChannel, settings.socialTelegram, settings.socialFacebook, settings.socialTiktok, settings.socialInstagram, settings.socialYoutube, settings.reviewsGoogle, settings.reviewsTrustpilot].some(Boolean) && (
            <>
              <h2 className="mb-2 mt-5 text-sm font-semibold">{t("followUs")}</h2>
              <CommunityBar settings={settings} label={t("community")} className="justify-start" />
            </>
          )}
        </div>
      </div>
      {settings.newsletterEnabled && <div className="container-page pb-6"><NewsletterForm /></div>}
      <div className="container-page flex flex-wrap items-center gap-x-6 gap-y-3 pb-6"><DataSaverToggle /><InstallLink /></div>
      <div className="border-t border-border py-5 text-center text-xs text-muted">
        © {new Date().getFullYear()} {settings.businessName}. {t("rights")}
      </div>
    </footer>
  );
}
