import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { getUser } from "@/lib/session";
import { getBalances } from "@/lib/ledger";
import { t as txt } from "@/lib/text";
import {
  KIND_ORDER, parseMeta, parseProviderDelivery, parseProviderRequire, productKind, productNeedsNoWarranty, PLATFORMS,
} from "@/lib/services";
import { OrderForm, type OrderCatalog } from "@/components/OrderForm";
import { PageBar } from "@/components/PageBar";
import { vipStatus } from "@/lib/vip";
import { formatMoney } from "@/lib/money";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "orderForm" });
  return { title: t("title") };
}

/** New order screen (mockup "Nouvo kòmand"): platform → service kind → one of three choices → link and quantity. */
export default async function OrderPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ platform?: string; kind?: string; tier?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const [user, products] = await Promise.all([
    getUser(),
    prisma.product.findMany({
      where: { isPublished: true, category: { slug: { in: Object.keys(PLATFORMS) } } },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      include: { category: true, variants: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
    }),
  ]);
  const balance = user ? (await getBalances(prisma, user.id)).HTG.available : null;
  const updates = (await prisma.serviceUpdate.findMany({ orderBy: { createdAt: "desc" }, take: 8 })).map((u) => ({ id: u.id, kind: u.kind, text: txt(u.text, locale), at: u.createdAt.toISOString() }));
  const vip = user ? await vipStatus(user.id) : null;

  const catalog: OrderCatalog = [];
  for (const p of products) {
    const kind = productKind(p.tags);
    if (!kind) continue;
    const tiers = p.variants
      .map((v) => ({ v, meta: parseMeta(v.service) }))
      .filter((x) => x.meta)
      // Only what customers may see: never the provider's own text (desc), and the admin flags stay on the server.
      .map(({ v, meta }) => {
        const require = parseProviderRequire(meta!.desc);
        const delivery = parseProviderDelivery(meta!.desc);
        const noWarranty = productNeedsNoWarranty(kind, meta!.desc);
        const { desc: _desc, riskLocked: _l, blocked: _b, pausedLoss: _p, ...shown } = meta!;
        const about = meta!.about ? txt(meta!.about, locale) : "";
        return {
          id: v.id,
          name: txt(v.name, locale),
          rate: v.salePriceHtg ?? v.priceHtg,
          soldOut: v.soldOut,
          require,
          delivery,
          noWarranty,
          meta: { ...shown, avg: { [locale]: txt(meta!.avg, locale) }, about: about ? { [locale]: about } : undefined },
        };
      });
    if (!tiers.length) continue;
    let platform = catalog.find((c) => c.slug === p.category.slug);
    if (!platform) {
      const info = PLATFORMS[p.category.slug];
      platform = { slug: p.category.slug, name: info.name, letter: info.letter, color: info.color, image: p.category.image ?? null, services: [] };
      catalog.push(platform);
    }
    platform.services.push({ kind, tiers });
  }
  for (const c of catalog) c.services.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));

  const t = await getTranslations("orderForm");
  return (
    <>
      <PageBar
        title={t("title")}
        back="/"
        backLabel={t("back")}
        right={balance !== null && <span className="rounded-full bg-primary-soft px-3 py-2 text-[13px] font-bold">{formatMoney(balance, "HTG", locale)}</span>}
      />
      <OrderForm
        catalog={catalog}
        balance={balance}
        signedIn={!!user}
        discount={vip?.level.discount ?? 0}
        updates={updates}
        initial={{ platform: sp.platform, kind: sp.kind, tier: sp.tier ? Number(sp.tier) : undefined }}
      />
    </>
  );
}
