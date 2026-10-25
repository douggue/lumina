import { headers } from "next/headers";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { checkLink, parseMeta, productKind, wantsPost } from "./services";
import { normalizePhone } from "./phone";
import { createFreeOrder } from "./orders";
import { notify } from "./notify";

export class TrialError extends Error {
  constructor(public code: "off" | "first_topup" | "used" | "link" | "phone" | "limit" | "offer") {
    super(code);
  }
}

/** The offers that point to an existing service choice. */
export async function trialOffers() {
  const s = await getSettings();
  const products = await prisma.product.findMany({
    where: { slug: { in: s.trialOffers.map((o) => o.product) }, isPublished: true },
    include: { category: true, variants: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
  });
  return s.trialOffers.flatMap((o) => {
    const p = products.find((x) => x.slug === o.product);
    const v = p?.variants[o.tier];
    if (!p || !v || !parseMeta(v.service)) return [];
    return [{ ...o, platform: p.category.slug, variantId: v.id, post: wantsPost(productKind(p.tags), parseMeta(v.service)!.type) }];
  });
}

/**
 * One free trial per account, phone number, social profile/video link and browser, with daily limits.
 * Requests wait for staff approval (Admin → Free trials).
 */
export async function requestTrial(userId: string, input: { offer: string; link: string; phone: string }) {
  const s = await getSettings();
  if (!s.trialEnabled) throw new TrialError("off");
  const offer = (await trialOffers()).find((o) => o.key === input.offer);
  if (!offer) throw new TrialError("offer");
  if (s.trialStrict) {
    const deposits = await prisma.paymentIntent.count({ where: { userId, orderId: null, status: "SUCCEEDED" } });
    if (deposits === 0) throw new TrialError("first_topup");
  }
  const link = checkLink(input.link, offer.platform, offer.post);
  if (!link.ok) throw new TrialError("link");
  const phone = normalizePhone(input.phone);
  if (!phone) throw new TrialError("phone");

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const deviceId = /(?:^|;\s*)hv_dev=([A-Za-z0-9_-]{16,64})/.exec(h.get("cookie") ?? "")?.[1] ?? null;
  const since = new Date(Date.now() - 86400000);
  const [taken, sameDevice, perIp, today] = await Promise.all([
    prisma.trialRequest.findFirst({ where: { OR: [{ userId }, { link: link.url }, { phone }] } }),
    deviceId ? prisma.trialRequest.count({ where: { deviceId } }) : 0,
    ip ? prisma.trialRequest.count({ where: { ip, createdAt: { gte: since } } }) : 0,
    prisma.trialRequest.count({ where: { createdAt: { gte: since } } }),
  ]);
  if (taken || sameDevice > 0) throw new TrialError("used");
  if (perIp >= s.trialPerIpPerDay || today >= s.trialPerDay) throw new TrialError("limit");
  try {
    return await prisma.trialRequest.create({ data: { userId, offer: offer.key, link: link.url, phone, ip, deviceId } });
  } catch {
    throw new TrialError("used"); // unique link / phone / account
  }
}

/** Staff decision: approving creates the free order and tells the customer. */
export async function decideTrial(id: string, approve: boolean, actorId: string, note?: string) {
  const trial = await prisma.trialRequest.findUniqueOrThrow({ where: { id } });
  if (trial.status !== "PENDING") return trial;
  if (!approve) return prisma.trialRequest.update({ where: { id }, data: { status: "REJECTED", decidedAt: new Date(), note: note ?? null } });
  const offer = (await trialOffers()).find((o) => o.key === trial.offer);
  if (!offer) throw new TrialError("offer");
  const order = await createFreeOrder({ userId: trial.userId, variantId: offer.variantId, quantity: offer.quantity, link: trial.link, note: "Free trial", actorId });
  await notify(trial.userId, "order_paid", { number: order.number }, `/account/orders/${order.id}`);
  return prisma.trialRequest.update({ where: { id }, data: { status: "APPROVED", decidedAt: new Date(), orderId: order.id } });
}
