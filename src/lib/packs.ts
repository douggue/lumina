import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { randomToken } from "./crypto";
import { getSettings } from "./settings";
import { chargeOrder } from "./wallet";
import { notify } from "./notify";
import { assertWithinNewAccountLimit, flag } from "./risk";
import { vipStatus, withDiscount } from "./vip";
import { addEvent, fulfillOrder, OrderError } from "./orders";
import { checkLink, parseMeta, productKind, wantsPost, type Kind, type ServiceMeta } from "./services";
import { maxVideosFor, packPrice, splitEvenly, tiktokHandle, type PackConfig } from "./pack-math";

export { maxVideosFor, packPrice, splitEvenly };

/**
 * Starter packs (category "pake"): a few service choices sold together with a discount. The pack's own choice keeps
 * its contents in `service`: { pack: [{ variantId, quantity }], discountPct, maxVideos, newOnly }.
 * The price is always worked out from the contents (sum of the choices' prices − the pack discount), so the "was"
 * price shown is true. Likes, views and comments can be spread over several videos (one link per line).
 */
export function packConfig(service: unknown): PackConfig {
  const o = (service && typeof service === "object" ? service : {}) as Record<string, unknown>;
  const items = Array.isArray(o.pack) ? o.pack.filter((x): x is { variantId: string; quantity: number } => !!x && typeof x.variantId === "string" && Number.isInteger(x.quantity) && x.quantity > 0) : [];
  const n = (v: unknown, d: number, lo: number, hi: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
  return { items, discountPct: n(o.discountPct, 10, 0, 80), maxVideos: n(o.maxVideos, 10, 1, 50), newOnly: o.newOnly === true };
}

export type PackLine = { variantId: string; quantity: number; name: Record<string, string>; productName: Record<string, string>; kind: Kind | null; post: boolean; rate: number; meta: ServiceMeta; platform: string; active: boolean };

/** A published pack with its contents (active service choices only). */
export async function loadPack(slug: string) {
  const product = await prisma.product.findFirst({ where: { slug, isPublished: true, category: { slug: "pake" } }, include: { variants: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, take: 1 } } });
  const v = product?.variants[0];
  if (!product || !v) return null;
  const config = packConfig(v.service);
  const choices = await prisma.productVariant.findMany({ where: { id: { in: config.items.map((i) => i.variantId) } }, include: { product: { include: { category: true } } } });
  const lines: PackLine[] = [];
  for (const it of config.items) {
    const c = choices.find((x) => x.id === it.variantId);
    const meta = parseMeta(c?.service);
    if (!c || !meta) continue;
    const kind = productKind(c.product.tags);
    lines.push({
      variantId: c.id, quantity: it.quantity, name: c.name as Record<string, string>, productName: c.product.name as Record<string, string>, kind,
      post: wantsPost(kind, meta.type), rate: c.salePriceHtg ?? c.priceHtg, meta, platform: c.product.category.slug, active: c.isActive && c.product.isPublished,
    });
  }
  const price = packPrice(lines, config.discountPct);
  return { product, variant: v, config, lines, ...price, maxVideos: maxVideosFor(lines, config.maxVideos) };
}

/** Keeps each pack's stored price (shown on cards) in line with its contents. */
export async function syncPackPrices() {
  const packs = await prisma.product.findMany({ where: { category: { slug: "pake" } }, include: { variants: { take: 1, orderBy: { sortOrder: "asc" } } } });
  for (const p of packs) {
    const l = await loadPack(p.slug);
    const v = p.variants[0];
    if (!l || !v || !l.lines.length) continue;
    if (v.priceHtg !== l.separate || v.salePriceHtg !== l.price) await prisma.productVariant.update({ where: { id: v.id }, data: { priceHtg: l.separate, salePriceHtg: l.price } });
  }
}

export type PackOrderInput = { userId: string; slug: string; profileLink?: string; videoLinks?: string; publicOk?: boolean; acceptRisk?: boolean };

/** Order a pack from the wallet: one order, one line per service and per video, each sent to its provider. */
export async function createPackOrder(input: PackOrderInput) {
  const pack = await loadPack(input.slug);
  if (!pack || !pack.lines.length || pack.lines.some((l) => !l.active)) throw new OrderError("unavailable");
  if (!input.publicOk) throw new OrderError("not_public");
  if (pack.config.newOnly) {
    const before = await prisma.order.count({ where: { userId: input.userId, status: { in: ["PAID", "PROCESSING", "FULFILLED"] } } });
    if (before > 0) throw new OrderError("pack_new_only");
  }
  if (pack.lines.some((l) => l.meta.risk === "high") && !input.acceptRisk) throw new OrderError("risk_not_accepted");

  const platform = pack.lines[0].platform;
  const profileLines = pack.lines.filter((l) => !l.post);
  const postLines = pack.lines.filter((l) => l.post);
  let profile: string | null = null;
  if (profileLines.length) {
    const c = checkLink(input.profileLink ?? "", platform, false);
    if (!c.ok) throw new OrderError("invalid_link");
    profile = c.url;
  }
  const videos: string[] = [];
  if (postLines.length) {
    const seen = new Set<string>();
    for (const raw of (input.videoLinks ?? "").split("\n").map((x) => x.trim()).filter(Boolean)) {
      const c = checkLink(raw, platform, true, postLines[0].meta.postType);
      if (!c.ok) throw new OrderError("invalid_video");
      if (!seen.has(c.url)) videos.push(c.url);
      seen.add(c.url);
    }
    if (!videos.length) throw new OrderError("invalid_video");
    if (videos.length > pack.maxVideos) throw new OrderError("too_many_videos");
    // TikTok links name the account: every video must belong to the profile given.
    const owner = profile ? tiktokHandle(profile) : null;
    if (owner && videos.some((u) => tiktokHandle(u) && tiktokHandle(u) !== owner)) throw new OrderError("other_account");
  }

  // One order line per service (profile) and per service × video, each with its own quantity.
  const parts: { line: PackLine; link: string; quantity: number }[] = [];
  for (const l of pack.lines) {
    if (!l.post) parts.push({ line: l, link: profile!, quantity: l.quantity });
    else splitEvenly(l.quantity, videos.length).forEach((q, i) => parts.push({ line: l, link: videos[i], quantity: q }));
  }
  if (parts.some((p) => p.quantity < p.line.meta.min || p.quantity > p.line.meta.max)) throw new OrderError("invalid_quantity");
  for (const p of parts) {
    const running = await prisma.orderItem.count({ where: { variantId: p.line.variantId, fieldValues: { path: ["link"], equals: p.link }, order: { status: { in: ["PAID", "PROCESSING"] } } } });
    if (running) throw new OrderError("same_link");
  }

  const vip = await vipStatus(input.userId);
  const total = withDiscount(pack.price, vip.level.discount);
  // The pack price is shared between the lines by their normal value (so a partial refund gives back the right part).
  const values = parts.map((p) => (p.line.rate * p.quantity) / 1000);
  const sum = values.reduce((a, b) => a + b, 0) || 1;
  const prices = values.map((v) => Math.floor((total * v) / sum));
  prices[0] += total - prices.reduce((a, b) => a + b, 0);

  const settings = await getSettings();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId } });
  if (user.status !== "ACTIVE") throw new OrderError("account_restricted");
  const packName = pack.product.name as Record<string, string>;
  const order = await prisma.$transaction(async (tx) => {
    await assertWithinNewAccountLimit(tx, user, total, settings);
    const created = await tx.order.create({
      data: {
        userId: input.userId, currency: "HTG", subtotal: total, total, paymentMethod: "WALLET", accessToken: randomToken(),
        items: {
          create: parts.map((p, i) => ({
            variantId: p.line.variantId,
            productName: p.line.productName as Prisma.InputJsonValue,
            variantName: Object.fromEntries(Object.entries(p.line.name).map(([l, n]) => [l, `${n} · ${p.quantity.toLocaleString("en-US")}`])),
            quantity: 1,
            unitPrice: prices[i],
            fieldValues: { link: p.link, quantity: String(p.quantity), pack: pack.product.slug, packName: JSON.stringify(packName), publicConfirmedAt: new Date().toISOString(), ...(p.line.meta.risk === "high" ? { riskAcceptedAt: new Date().toISOString() } : {}) },
          })),
        },
      },
    });
    await addEvent(tx, created.id, "AWAITING_PAYMENT", `Pack ${packName.ht ?? pack.product.slug} · ${parts.length} lines · WALLET`);
    if (total >= settings.reviewOrderThresholdHtg) await flag(tx, "High-value order: review before release", { userId: input.userId, orderId: created.id });
    await chargeOrder(tx, created);
    await tx.order.update({ where: { id: created.id }, data: { status: "PAID", paidAt: new Date() } });
    await addEvent(tx, created.id, "PAID", "Paid from wallet");
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

  await notify(order.userId, "order_paid", { number: order.number }, `/account/orders/${order.id}`);
  await fulfillOrder(order.id);
  return order;
}
