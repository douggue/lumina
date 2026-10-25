import { headers } from "next/headers";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { checkLink, isShortLink, parseMeta, productKind, wantsPost } from "./services";
import { normalizePhone } from "./phone";
import { createFreeOrder } from "./orders";
import { notify } from "./notify";
import { resolveShortLink } from "./link-resolve";
import { socialAccountKey } from "./social-account";
import { checkIpNetwork } from "./vpn-check";
import { isDisposableEmail, scoreTrialRisk, type TrialRiskThresholds } from "./trial-risk";
import { isPhoneVerified, whatsappVerifyEnabled } from "./whatsapp-verify";
import { verifyTurnstile, turnstileEnabled } from "./turnstile";

export class TrialError extends Error {
  constructor(
    public code: "off" | "first_topup" | "used" | "link" | "phone" | "limit" | "offer" | "vpn" | "risk" | "phone_verify",
  ) {
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

function trialThresholds(s: Awaited<ReturnType<typeof getSettings>>): TrialRiskThresholds {
  return {
    autoMax: s.trialRiskAutoMax,
    refuseMin: s.trialRiskRefuseMin,
    autoApprove: s.trialAutoApprove,
  };
}

/**
 * One free trial per account, phone number, social account (not just exact URL) and browser, with daily limits.
 * WhatsApp phone verify, VPN/datacenter block, and a risk score (auto / review / refuse) when configured.
 */
export async function requestTrial(userId: string, input: { offer: string; link: string; phone: string; turnstileToken?: string | null }) {
  const s = await getSettings();
  if (!s.trialEnabled) throw new TrialError("off");
  const offer = (await trialOffers()).find((o) => o.key === input.offer);
  if (!offer) throw new TrialError("offer");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, emailVerified: true, createdAt: true },
  });

  const deposits = await prisma.paymentIntent.count({ where: { userId, orderId: null, status: "SUCCEEDED" } });
  if (s.trialStrict && deposits === 0) throw new TrialError("first_topup");

  let link = checkLink(input.link, offer.platform, offer.post);
  if (!link.ok) throw new TrialError("link");
  if (isShortLink(link.url, offer.platform)) {
    const full = await resolveShortLink(link.url);
    if (full) {
      const again = checkLink(full, offer.platform, offer.post);
      if (!again.ok) throw new TrialError("link");
      link = again;
    }
  }

  const socialKey = socialAccountKey(link.url, offer.platform);
  const phone = normalizePhone(input.phone);
  if (!phone) throw new TrialError("phone");

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const deviceId = /(?:^|;\s*)hv_dev=([A-Za-z0-9_-]{16,64})/.exec(h.get("cookie") ?? "")?.[1] ?? null;

  const phoneVerified = whatsappVerifyEnabled() ? await isPhoneVerified(userId, phone) : !s.trialRequirePhoneVerified;
  if (s.trialRequirePhoneVerified && whatsappVerifyEnabled() && !phoneVerified) throw new TrialError("phone_verify");

  const net = s.trialBlockVpn ? await checkIpNetwork(ip) : { signal: "unknown" as const, block: false };
  if (s.trialBlockVpn && net.block) throw new TrialError("vpn");

  const since = new Date(Date.now() - 86400000);
  const [taken, socialTaken, sameDevice, perIp, today] = await Promise.all([
    prisma.trialRequest.findFirst({ where: { OR: [{ userId }, { link: link.url }, { phone }] } }),
    socialKey ? prisma.trialRequest.findFirst({ where: { socialAccountKey: socialKey } }) : null,
    deviceId ? prisma.trialRequest.count({ where: { deviceId } }) : 0,
    ip ? prisma.trialRequest.count({ where: { ip, createdAt: { gte: since } } }) : 0,
    prisma.trialRequest.count({ where: { createdAt: { gte: since } } }),
  ]);
  if (taken || socialTaken || sameDevice > 0) throw new TrialError("used");
  if (perIp >= s.trialPerIpPerDay || today >= s.trialPerDay) throw new TrialError("limit");

  const turnstileFailed = turnstileEnabled() ? !(await verifyTurnstile(input.turnstileToken, ip)) : false;
  const ageDays = (Date.now() - user.createdAt.getTime()) / 86_400_000;
  const risk = scoreTrialRisk(
    {
      phoneVerified: phoneVerified || !whatsappVerifyEnabled(),
      hasDeviceId: !!deviceId,
      deviceReuse: sameDevice > 0,
      networkSignal: net.signal,
      disposableEmail: isDisposableEmail(user.email),
      accountAgeDays: ageDays,
      turnstileFailed,
      noDeposit: deposits === 0,
      emailVerified: !!user.emailVerified,
    },
    trialThresholds(s),
  );
  if (risk.band === "refuse") throw new TrialError("risk");

  const auto = risk.band === "auto";
  try {
    const trial = await prisma.trialRequest.create({
      data: {
        userId,
        offer: offer.key,
        link: link.url,
        socialAccountKey: socialKey,
        phone,
        phoneVerifiedAt: phoneVerified ? new Date() : null,
        ip,
        deviceId,
        networkSignal: net.signal,
        riskScore: risk.score,
        riskBand: risk.band,
        status: auto ? "APPROVED" : "PENDING",
        decidedAt: auto ? new Date() : null,
        note: risk.reasons.slice(0, 8).join("; ").slice(0, 500) || null,
      },
    });
    if (auto) {
      const order = await createFreeOrder({ userId, variantId: offer.variantId, quantity: offer.quantity, link: link.url, note: "Free trial", actorId: userId });
      await notify(userId, "order_paid", { number: order.number }, `/account/orders/${order.id}`);
      return prisma.trialRequest.update({ where: { id: trial.id }, data: { orderId: order.id } });
    }
    return trial;
  } catch {
    throw new TrialError("used"); // unique link / phone / account / social key
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
