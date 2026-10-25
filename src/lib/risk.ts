import type { Tx } from "./db";
import type { Settings } from "./settings";

/** HTG-equivalent volume (deposits + orders) a user created since midnight UTC. */
async function todaysVolumeHtg(tx: Tx, userId: string, htgPerUsd: number) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const [deposits, orders] = await Promise.all([
    tx.paymentIntent.aggregate({
      where: { userId, orderId: null, createdAt: { gte: since }, status: { in: ["PENDING", "REVIEW", "SUCCEEDED"] } },
      _sum: { amount: true },
    }),
    tx.order.findMany({
      where: { userId, createdAt: { gte: since }, status: { notIn: ["CANCELED", "FAILED", "REFUNDED"] } },
      select: { total: true, currency: true },
    }),
  ]);
  const orderHtg = orders.reduce((s, o) => s + (o.currency === "HTG" ? o.total : Math.round(o.total * htgPerUsd)), 0);
  return (deposits._sum.amount ?? 0) + orderHtg;
}

export class LimitExceededError extends Error {}

/** New accounts get a lower daily limit (blueprint §8). */
export async function assertWithinNewAccountLimit(
  tx: Tx,
  user: { id: string; createdAt: Date },
  addHtg: number,
  s: Settings,
) {
  const ageDays = (Date.now() - user.createdAt.getTime()) / 86_400_000;
  if (ageDays >= s.newAccountDays) return;
  const used = await todaysVolumeHtg(tx, user.id, s.htgPerUsd);
  if (used + addHtg > s.newAccountDailyLimitHtg) throw new LimitExceededError("new_account_limit");
}

export async function flag(
  tx: Tx,
  reason: string,
  refs: { userId?: string; orderId?: string; paymentIntentId?: string },
) {
  return tx.riskFlag.create({ data: { reason, ...refs } });
}
