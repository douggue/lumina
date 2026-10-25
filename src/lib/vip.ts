import { prisma } from "./db";
import { withDiscount } from "./vip-math";

export { withDiscount };

/** VIP levels by total spent (HTG centimes): the more a customer spends, the lower their prices. */
export const VIP_LEVELS = [
  { key: "bronze", name: { ht: "Bwonz", fr: "Bronze" }, min: 0, discount: 0 },
  { key: "silver", name: { ht: "Ajan", fr: "Argent" }, min: 5_000_00, discount: 3 },
  { key: "gold", name: { ht: "Lò", fr: "Or" }, min: 15_000_00, discount: 5 },
  { key: "diamond", name: { ht: "Dyaman", fr: "Diamant" }, min: 50_000_00, discount: 8 },
] as const;

export type VipStatus = { spent: number; level: (typeof VIP_LEVELS)[number]; next: (typeof VIP_LEVELS)[number] | null };

/** Paid and delivered orders count; refunded and cancelled ones don't. */
export async function vipStatus(userId: string): Promise<VipStatus> {
  const r = await prisma.order.aggregate({ where: { userId, currency: "HTG", status: { in: ["PAID", "PROCESSING", "FULFILLED"] } }, _sum: { total: true } });
  const spent = r._sum.total ?? 0;
  let i = 0;
  while (i + 1 < VIP_LEVELS.length && spent >= VIP_LEVELS[i + 1].min) i++;
  return { spent, level: VIP_LEVELS[i], next: VIP_LEVELS[i + 1] ?? null };
}

