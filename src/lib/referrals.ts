import { randomBytes } from "node:crypto";
import { prisma } from "./db";
import { getSettings, type RefTier, type Settings } from "./settings";
import { earningsAccount, post, systemAccount, walletAccount, InsufficientFundsError } from "./ledger";
import { notify } from "./notify";
import { linkedAccounts } from "./devices";
import { normalizePhone } from "./phone";

/**
 * Referral program ("Envite zanmi"): a % of every completed order of a direct friend (no multi-level), by the
 * referrer's tier over the last 30 days. Commissions wait `refHoldDays` after the order completes, then go to the
 * referrer's EARNINGS balance (separate from the wallet: only earnings can be withdrawn, never deposited money).
 * Earnings are withdrawn to MonCash / NatCash (staff send them; minimum `refMinPayoutHtg`) or moved to the wallet.
 * Accounts that share a browser or a phone number with their referrer earn nothing.
 */

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no look-alike characters

export async function ensureReferralCode(userId: string): Promise<string> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } });
  if (u.referralCode) return u.referralCode;
  for (let i = 0; i < 5; i++) {
    const code = Array.from(randomBytes(7), (b) => ALPHABET[b % ALPHABET.length]).join("");
    try {
      await prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
      return code;
    } catch {
      // collision: try another code
    }
  }
  throw new Error("Could not create a referral code");
}

/** Called when a new account is created with a referral cookie. */
export async function recordReferral(referredId: string, code: string | undefined, ip: string | null) {
  if (!code) return;
  const settings = await getSettings();
  if (!settings.referralEnabled) return;
  const referrer = await prisma.user.findUnique({ where: { referralCode: code.toUpperCase() }, select: { id: true, status: true } });
  if (!referrer || referrer.id === referredId || referrer.status !== "ACTIVE") return;
  await prisma.referral.create({ data: { referrerId: referrer.id, referredId, signupIp: ip } }).catch(() => undefined);
}

/** Tier from the last 30 days: friends with a completed order, and the total of their completed orders. */
export async function referralStats(referrerId: string, s?: Settings) {
  const settings = s ?? (await getSettings());
  const since = new Date(Date.now() - 30 * 86_400_000);
  const refs = await prisma.referral.findMany({ where: { referrerId }, select: { referredId: true, status: true } });
  const ok = refs.filter((r) => r.status !== "REJECTED").map((r) => r.referredId);
  const orders = ok.length
    ? await prisma.order.findMany({ where: { userId: { in: ok }, status: "FULFILLED", currency: "HTG", fulfilledAt: { gte: since } }, select: { userId: true, total: true } })
    : [];
  const active = new Set(orders.map((o) => o.userId)).size;
  const volume = orders.reduce((a, o) => a + o.total, 0);
  const tiers = [...settings.refTiers].sort((a, b) => a.pct - b.pct);
  let i = 0;
  for (let k = 0; k < tiers.length; k++) if (active >= tiers[k].minActive || (tiers[k].minVolume > 0 && volume >= tiers[k].minVolume)) i = k;
  return { invited: refs.length, active, volume, tier: tiers[i], next: (tiers[i + 1] ?? null) as RefTier | null, tiers };
}

/** Same person behind both accounts? Same browser, or the same phone number. */
async function sameOwner(referrerId: string, referredId: string) {
  const linked = await linkedAccounts(referredId);
  if (linked.some((l) => l.id === referrerId && l.sameDevice)) return "Same browser as the referrer";
  const [a, b] = await prisma.user.findMany({ where: { id: { in: [referrerId, referredId] } }, select: { phone: true } });
  const pa = a?.phone ? normalizePhone(a.phone) : null;
  const pb = b?.phone ? normalizePhone(b.phone) : null;
  if (pa && pa === pb) return "Same phone number as the referrer";
  return null;
}

/** When a referred friend's order completes (fulfillOrder): a pending commission at the referrer's current rate. */
export async function createCommission(orderId: string) {
  const settings = await getSettings();
  if (!settings.referralEnabled) return;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "FULFILLED" || order.currency !== "HTG" || order.total <= 0) return;
  const ref = await prisma.referral.findUnique({ where: { referredId: order.userId } });
  if (!ref || ref.status === "REJECTED") return;
  if (settings.refMonths > 0 && Date.now() - ref.createdAt.getTime() > settings.refMonths * 30 * 86_400_000) return;
  const why = await sameOwner(ref.referrerId, ref.referredId);
  if (why) {
    await prisma.referral.update({ where: { id: ref.id }, data: { status: "REJECTED", note: why } });
    return;
  }
  const { tier } = await referralStats(ref.referrerId, settings);
  await prisma.referralCommission.create({
    data: {
      referrerId: ref.referrerId, referredId: ref.referredId, orderId, orderTotal: order.total, pct: tier.pct, tier: tier.key,
      amount: Math.floor((order.total * tier.pct) / 100), availableAt: new Date(Date.now() + settings.refHoldDays * 86_400_000),
    },
  }).catch(() => undefined); // one commission per order
  if (ref.status === "PENDING") await prisma.referral.update({ where: { id: ref.id }, data: { status: "REWARDED", rewardedAt: new Date() } });
}

/** Cron: commissions whose hold is over go to the earnings balance (less any part of the order refunded since). */
export async function matureCommissions() {
  const due = await prisma.referralCommission.findMany({ where: { status: "PENDING", availableAt: { lte: new Date() } }, take: 200 });
  let paid = 0;
  for (const c of due) {
    const order = await prisma.order.findUnique({ where: { id: c.orderId }, include: { items: { include: { supplierOrders: { select: { refundedPartial: true } } } } } });
    if (!order || order.status !== "FULFILLED") {
      await prisma.referralCommission.update({ where: { id: c.id }, data: { status: "CANCELED", amount: 0 } });
      continue;
    }
    const refunded = order.items.reduce((a, i) => a + i.supplierOrders.reduce((b, s) => b + (s.refundedPartial ?? 0), 0), 0);
    const amount = Math.floor((Math.max(0, order.total - refunded) * c.pct) / 100);
    const done = await prisma.$transaction(async (tx) => {
      const claim = await tx.referralCommission.updateMany({ where: { id: c.id, status: "PENDING" }, data: { status: amount > 0 ? "AVAILABLE" : "CANCELED", amount } });
      if (claim.count !== 1 || amount <= 0) return false;
      const earnings = await earningsAccount(tx, c.referrerId);
      const source = await systemAccount(tx, "adjustment", "HTG", "referral");
      await post(tx, {
        type: "ADJUSTMENT", idempotencyKey: `commission:${c.id}`, description: `Referral commission ${c.pct}% on order`,
        metadata: { commissionId: c.id, orderId: c.orderId },
        entries: [{ accountId: source.id, currency: "HTG", amount: -amount }, { accountId: earnings.id, currency: "HTG", amount }],
      });
      return true;
    });
    if (done) {
      paid++;
      await notify(c.referrerId, "referral_rewarded", { amount, currency: "HTG" }, "/account/referrals");
    }
  }
  return paid;
}

export async function earningsBalance(userId: string) {
  const [acct, pending] = await Promise.all([
    prisma.ledgerAccount.findUnique({ where: { code: `earnings:${userId}:HTG` }, select: { balance: true } }),
    prisma.referralCommission.aggregate({ where: { referrerId: userId, status: "PENDING" }, _sum: { amount: true } }),
  ]);
  return { available: acct?.balance ?? 0, pending: pending._sum.amount ?? 0 };
}

export class PayoutError extends Error {
  constructor(public code: "min" | "balance" | "open" | "phone" | "method") {
    super(code);
  }
}

/** Withdrawal request: the amount is set aside at once (so it can't be spent twice); staff send it, or reject it back. */
export async function requestPayout(userId: string, input: { amount: number; method: string; phone: string }) {
  const s = await getSettings();
  if (input.method !== "MONCASH" && input.method !== "NATCASH") throw new PayoutError("method");
  const phone = normalizePhone(input.phone);
  if (!phone) throw new PayoutError("phone");
  if (!Number.isInteger(input.amount) || input.amount < s.refMinPayoutHtg) throw new PayoutError("min");
  if (await prisma.payout.count({ where: { userId, status: "REQUESTED" } })) throw new PayoutError("open");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
  try {
    return await prisma.$transaction(async (tx) => {
      const p = await tx.payout.create({ data: { userId, amount: input.amount, method: input.method, phone, name: user.name } });
      const earnings = await earningsAccount(tx, userId);
      const pending = await systemAccount(tx, "clearing", "HTG", "payouts");
      await post(tx, {
        type: "ADJUSTMENT", idempotencyKey: `payout:${p.id}:hold`, description: `Withdrawal request to ${input.method}`,
        metadata: { payoutId: p.id }, entries: [{ accountId: earnings.id, currency: "HTG", amount: -input.amount }, { accountId: pending.id, currency: "HTG", amount: input.amount }],
      });
      return p;
    });
  } catch (e) {
    if (e instanceof InsufficientFundsError) throw new PayoutError("balance");
    throw e;
  }
}

/** Staff: sent (with the MonCash/NatCash reference) or rejected (the money goes back to the earnings balance). */
export async function decidePayout(id: string, sent: boolean, staffId: string, text: string) {
  const p = await prisma.$transaction(async (tx) => {
    const claim = await tx.payout.updateMany({ where: { id, status: "REQUESTED" }, data: { status: sent ? "SENT" : "REJECTED", decidedById: staffId, decidedAt: new Date(), ...(sent ? { reference: text.slice(0, 100) } : { note: text.slice(0, 300) }) } });
    if (claim.count !== 1) throw new Error("Already handled");
    const payout = await tx.payout.findUniqueOrThrow({ where: { id } });
    const pending = await systemAccount(tx, "clearing", "HTG", "payouts");
    const to = sent ? await systemAccount(tx, "adjustment", "HTG", "payouts-sent") : await earningsAccount(tx, payout.userId);
    await post(tx, {
      type: "ADJUSTMENT", idempotencyKey: `payout:${id}:${sent ? "sent" : "return"}`, description: sent ? `Withdrawal sent by ${payout.method}` : "Withdrawal rejected: back to earnings",
      createdById: staffId, metadata: { payoutId: id }, entries: [{ accountId: pending.id, currency: "HTG", amount: -payout.amount }, { accountId: to.id, currency: "HTG", amount: payout.amount }],
    });
    return payout;
  });
  await notify(p.userId, sent ? "payout_sent" : "payout_rejected", { amount: p.amount, currency: "HTG", method: p.method === "MONCASH" ? "MonCash" : "NatCash" }, "/account/referrals");
  return p;
}

/** Earnings → wallet, at once and without a minimum (to order with it). */
export async function earningsToWallet(userId: string, amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) throw new PayoutError("balance");
  try {
    await prisma.$transaction(async (tx) => {
      const earnings = await earningsAccount(tx, userId);
      const wallet = await walletAccount(tx, userId, "HTG");
      await post(tx, {
        type: "ADJUSTMENT", idempotencyKey: `earnings-to-wallet:${userId}:${Date.now()}:${randomBytes(4).toString("hex")}`, description: "Referral earnings moved to the wallet",
        entries: [{ accountId: earnings.id, currency: "HTG", amount: -amount }, { accountId: wallet.id, currency: "HTG", amount }],
      });
    });
  } catch (e) {
    if (e instanceof InsufficientFundsError) throw new PayoutError("balance");
    throw e;
  }
}
