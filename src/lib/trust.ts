import { prisma } from "./db";
import { isExchangeProduct, type ExchangePricing } from "./amount";
import { cityFlag } from "./cities";

export { CITIES, cityFlag, isCity } from "./cities";

/** "Jean-Philippe Moïse" → "Jean-Philippe M." — first name and last initial only. */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0].slice(0, 24);
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

export type FeedSale = { name: string; city: string; flag: string; productId: string; soldAt: number };

/**
 * Sales shown in the popup: delivered site orders (customers with a city who didn't opt out) and sales added
 * by staff from WhatsApp, last 7 days, only for products with the popup turned on. Never exchange products.
 */
export async function recentSales(productId: string, exchange: ExchangePricing): Promise<FeedSale[]> {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { salesPopup: true, category: { select: { id: true, parentId: true } } } });
  if (!product?.salesPopup || isExchangeProduct(exchange, product.category)) return [];
  const [orders, manual] = await Promise.all([
    prisma.orderItem.findMany({
      where: { status: "DELIVERED", variant: { productId }, order: { status: "FULFILLED", fulfilledAt: { gte: since }, user: { showInFeed: true, city: { not: null } } } },
      select: { order: { select: { fulfilledAt: true, user: { select: { name: true, city: true } } } } },
      orderBy: { order: { fulfilledAt: "desc" } },
      take: 20,
    }),
    prisma.saleFeedItem.findMany({ where: { productId, soldAt: { gte: since } }, orderBy: { soldAt: "desc" }, take: 20 }),
  ]);
  const list: FeedSale[] = [
    ...orders.map((o) => ({ name: shortName(o.order.user.name), city: o.order.user.city!, flag: cityFlag(o.order.user.city), productId, soldAt: o.order.fulfilledAt!.getTime() })),
    ...manual.map((m) => ({ name: m.name, city: m.city, flag: cityFlag(m.city), productId, soldAt: m.soldAt.getTime() })),
  ].filter((x) => x.name);
  return list.sort((a, b) => b.soldAt - a.soldAt).slice(0, 12);
}

/** Variant ids whose "Stock is low" message should show right now. */
export function lowStockVariants(
  variants: { id: string; lowStock: string; lowStockUntil: Date | null }[],
  stock: Record<string, number> | null,
  limit: number,
): string[] {
  const now = Date.now();
  return variants
    .filter((v) => {
      if (v.lowStock === "on") return !v.lowStockUntil || v.lowStockUntil.getTime() > now;
      if (v.lowStock === "auto" && stock) {
        const left = stock[v.id] ?? 0;
        return left > 0 && left <= limit;
      }
      return false;
    })
    .map((v) => v.id);
}
