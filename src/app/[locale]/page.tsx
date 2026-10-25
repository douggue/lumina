import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { getUser } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { normalizeHomepage } from "@/lib/homepage";
import { pageSeo } from "@/lib/seo";
import { siteUrl } from "@/lib/site-url";
import { PayBadges } from "@/components/PayLogo";
import { Link } from "@/i18n/navigation";
import { getDisplaySettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { t } from "@/lib/text";
import { parseMeta, PLATFORMS, productKind } from "@/lib/services";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return pageSeo(locale, "/", "");
}

/** Home (mockup "Akèy"): services status, hero, free trial, platforms, starter packs, most popular services. */
export default async function HomePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const viewer = sp.preview ? await getUser() : null;
  const preview = !!viewer && isStaff(viewer.role) && !!viewer.twoFactorEnabled;
  const [th, tc, settings, categories, packs, popular] = await Promise.all([
    getTranslations("home"),
    getTranslations("common"),
    getDisplaySettings(),
    prisma.category.findMany({ where: { isVisible: true, parentId: null, slug: { in: Object.keys(PLATFORMS) } }, orderBy: { sortOrder: "asc" } }),
    prisma.product.findMany({ where: { isPublished: true, category: { slug: "pake" } }, orderBy: { sortOrder: "asc" }, take: 2, include: { variants: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, take: 1 } } }),
    prisma.product.findMany({ where: { isPublished: true, isFeatured: true, category: { slug: { in: Object.keys(PLATFORMS) } } }, orderBy: { sortOrder: "asc" }, take: 3, include: { category: true, variants: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } } }),
  ]);
  const home = normalizeHomepage(preview ? settings.homepageDraft : settings.homepage);
  const heroTitle = t(home.hero.title, locale) || th("heroTitle");
  const heroSubtitle = t(home.hero.subtitle, locale) || th("heroSubtitle");

  const orgJsonLd = { "@context": "https://schema.org", "@type": "Organization", name: settings.businessName, url: siteUrl(), address: settings.businessAddress };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
      {preview && <div className="bg-warning px-4 py-2 text-center text-sm font-semibold text-midnight">Preview of the unpublished homepage draft</div>}

      {Object.values(settings.serviceStatus ?? {}).some((s) => s !== "ok") ? (
        <Link href="/help" className="flex items-center gap-2 border-b border-[#FDE68A] bg-[#FFFBEB] px-4 py-[9px] text-xs font-bold text-[#92400E]">
          <span className="h-2 w-2 rounded-full bg-[#D97706]" />
          {tc("statusSome")}
        </Link>
      ) : (
        <Link href="/help" className="flex items-center gap-2 border-b border-[#DCFCE7] bg-[#F0FDF4] px-4 py-[9px] text-xs font-bold text-[#166534] dark:border-success-soft dark:bg-success-soft dark:text-success">
          <span className="h-2 w-2 rounded-full bg-[#16A34A]" />
          {tc("statusOk")}
        </Link>
      )}

      <div className="mx-auto flex max-w-[560px] flex-col gap-5 px-5 py-[18px] md:max-w-3xl">
        <section className="relative flex flex-col gap-2.5 overflow-hidden rounded-[20px] bg-primary p-5 text-white">
          <div aria-hidden className="absolute -right-10 -top-10 h-[140px] w-[140px] rounded-full bg-[#D21034]" />
          <h1 className="relative max-w-[240px] text-[25px] font-extrabold leading-[1.15] md:max-w-none md:text-3xl">{heroTitle}</h1>
          <p className="relative text-sm leading-normal text-[#DCE3FF]">{heroSubtitle}</p>
          <PayBadges className="relative" />
          <Link href="/order" className="relative self-start keep-white rounded-xl bg-white px-[18px] py-3 text-[15px] font-bold text-[#0F172A]">{th("heroCta")}</Link>
        </section>

        <Link href="/trial" className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-[#F59E0B] bg-surface p-3.5 text-text">
          <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-[#FEF3C7] text-[#B45309]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1.5S9 8 12 8c3 0 6-1 6-3.5S14 4 12 8z" /></svg>
          </span>
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-extrabold">{th("trialTitle")}</span>
            <span className="text-xs text-muted">{th("trialBody")}</span>
          </span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="9 18 15 12 9 6" /></svg>
        </Link>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-bold">{th("choosePlatform")}</h2>
          <div className="grid grid-cols-3 gap-2.5 md:grid-cols-6">
            {categories.map((c) => {
              const info = PLATFORMS[c.slug];
              return (
                <Link key={c.id} href={`/order?platform=${c.slug}`} className="flex flex-col items-center gap-2 rounded-[14px] border border-border bg-surface px-1.5 py-3.5 text-text">
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image} alt="" className="h-[38px] w-[38px] rounded-[11px] object-cover" />
                  ) : (
                    <span className="grid h-[38px] w-[38px] place-items-center rounded-[11px] text-sm font-extrabold text-white" style={{ background: info.color }}>{info.letter}</span>
                  )}
                  <span className="text-[13px] font-semibold">{t(c.name, locale)}</span>
                </Link>
              );
            })}
          </div>
        </section>

        {packs.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold">{th("packsTitle")}</h2>
              {(() => {
                const v = packs[0].variants[0];
                return v?.salePriceHtg ? <span className="text-xs font-bold text-[#B45309]">-{Math.round((1 - v.salePriceHtg / v.priceHtg) * 100)}%</span> : null;
              })()}
            </div>
            <div className="flex gap-2.5">
              {packs.map((p) => {
                const v = p.variants[0];
                const info = PLATFORMS[p.slug.split("-")[0]] ?? PLATFORMS[p.slug.startsWith("insta") ? "instagram" : "tiktok"];
                return (
                  <Link key={p.id} href={`/order/pack/${p.slug}`} className="flex min-w-0 flex-1 flex-col gap-2 rounded-2xl border border-border bg-surface p-3.5 text-text">
                    <span className="flex items-center gap-2">
                      <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[9px] text-[11px] font-extrabold text-white" style={{ background: p.accent ?? info?.color }}>{info?.letter}</span>
                      <span className="text-sm font-extrabold">{t(p.name, locale)}</span>
                    </span>
                    <span className="whitespace-pre-line text-xs leading-normal text-muted">{t(p.description, locale)}</span>
                    {v && (
                      <span className="flex items-baseline gap-1.5">
                        <span className="text-base font-extrabold">{formatMoney(v.salePriceHtg ?? v.priceHtg, "HTG", locale)}</span>
                        {v.salePriceHtg && <span className="text-xs text-[#64748B] line-through">{formatMoney(v.priceHtg, "HTG", locale)}</span>}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-2.5">
          <h2 className="text-base font-bold">{th("popularTitle")}</h2>
          {popular.map((p) => {
            const tiers = p.variants.filter((v) => parseMeta(v.service));
            const main = tiers[1] ?? tiers[0];
            if (!main) return null;
            const meta = parseMeta(main.service)!;
            return (
              <Link key={p.id} href={`/order?platform=${p.category.slug}&kind=${productKind(p.tags) ?? ""}`} className="flex items-center justify-between gap-3 rounded-[14px] border border-border bg-surface px-3.5 py-3 text-text">
                <span className="flex flex-col gap-[3px]">
                  <span className="text-sm font-bold">{t(p.name, locale)}</span>
                  <span className="text-xs text-muted">{th("avgDelivery", { time: t(meta.avg, locale) })}</span>
                </span>
                <span className="whitespace-nowrap text-sm font-extrabold">{formatMoney(main.salePriceHtg ?? main.priceHtg, "HTG", locale)} {th("per1000")}</span>
              </Link>
            );
          })}
        </section>
      </div>
    </>
  );
}
