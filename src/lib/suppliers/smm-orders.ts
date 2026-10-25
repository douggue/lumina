import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { refundPart } from "../wallet";
import { notify } from "../notify";
import { formatMoney } from "../money";
import { getSettings } from "../settings";
import { smmAdd, smmCancel, smmOutcome, smmRefill, smmRefillStatus, smmStatuses, type SmmProgress } from "./smm";

/**
 * SMM panel orders (suppliers with preset smm_panel / smm_mock), on top of the supplier order steps in orders.ts:
 *   sent → PENDING (progress saved on each check: start count, remains)
 *        → Completed: delivered
 *        → Partial: the undelivered part goes back to the wallet automatically, the rest counts as delivered
 *        → Canceled: same, nothing delivered = full refund
 *   refused when sending → the backup provider is tried once, else the customer is refunded
 *   no clear answer when sending → UNKNOWN, never sent again: staff checks on the provider's site
 */
export const isSmm = (preset: string) => preset === "smm_panel" || preset === "smm_mock";

const CHECK_MIN = [1, 2, 5, 10, 15];
const GIVE_UP_MS = 30 * 24 * 3_600_000;
const nextCheck = (checks: number) => new Date(Date.now() + CHECK_MIN[Math.min(checks, CHECK_MIN.length - 1)] * 60_000);

export const smmInclude = {
  supplier: true,
  orderItem: { include: { order: true, variant: { include: { backupSupplier: true } }, supplierOrders: { select: { supplierId: true } } } },
} as const;
export type SmmOrder = Prisma.SupplierOrderGetPayload<{ include: typeof smmInclude }>;

/** Ordered quantity: the service quantity saved on the line (not the line's own count, which is always 1). */
export function lineQuantity(fields: Record<string, string>) {
  return Number(fields.quantity) || 0;
}

/**
 * Provider service id for this attempt. Live viewers can link one provider service per duration:
 * "15=201,30=202,60=203,120=204" (minutes = service id).
 */
export function serviceIdFor(sku: string, fields: Record<string, string>) {
  if (!sku.includes("=")) return sku.trim();
  const want = fields.durationMin ?? "30";
  const pairs = sku.split(",").map((p) => p.split("=").map((x) => x.trim()));
  return pairs.find(([m]) => m === want)?.[1] ?? "";
}

/** Money to give back for the part not delivered: price × remains ÷ quantity, never more than the line. */
export function partialRefund(linePrice: number, quantity: number, remains: number) {
  if (quantity <= 0 || remains <= 0) return 0;
  return Math.min(linePrice, Math.round((linePrice * Math.min(remains, quantity)) / quantity));
}

export async function sendSmm(so: SmmOrder): Promise<void> {
  const fields = (so.orderItem.fieldValues ?? {}) as Record<string, string>;
  const sku = so.sku ?? so.orderItem.variant.supplierSku ?? "";
  const service = serviceIdFor(sku, fields);
  const qty = lineQuantity(fields);
  const drip = /^(\d+)x(\d+)\/(\d+)min$/.exec(fields.drip ?? "");
  const r = service
    ? await smmAdd(so.supplier, {
        service,
        link: fields.link ?? "",
        quantity: drip ? Number(drip[2]) : qty,
        runs: drip ? Number(drip[1]) : undefined,
        interval: drip ? Number(drip[3]) : undefined,
        comments: fields.comments || undefined,
        username: fields.username || undefined,
      }, so.id)
    : ({ result: "refused", message: "No provider service linked to this choice" } as const);

  if (r.result === "ok") {
    // Estimated cost from the provider's price list; replaced by the provider's own "charge" on status checks.
    const ps = await prisma.providerService.findUnique({ where: { supplierId_serviceId: { supplierId: so.supplierId, serviceId: service } }, select: { rate: true } });
    const units = drip ? Number(drip[1]) * Number(drip[2]) : qty;
    const costUsd = ps ? (Number(ps.rate) * units) / 1000 : null;
    await prisma.supplierOrder.update({ where: { id: so.id }, data: { status: "PENDING", supplierOrderId: r.orderId, message: null, lockedUntil: null, nextCheckAt: nextCheck(0), ...(costUsd !== null ? await costData(costUsd) : {}) } });
    return;
  }
  if (r.result === "unknown") {
    await prisma.supplierOrder.update({ where: { id: so.id }, data: { status: "UNKNOWN", message: `No clear answer (${r.message}). Check on the provider's site, then close or retry here.`.slice(0, 500), lockedUntil: null, nextCheckAt: null } });
    return;
  }
  // Clearly refused: nothing was created at the provider.
  await prisma.$transaction([
    prisma.supplierOrder.update({ where: { id: so.id }, data: { status: "FAILED", message: r.message.slice(0, 500), lockedUntil: null, nextCheckAt: null } }),
    prisma.orderEvent.create({ data: { orderId: so.orderItem.orderId, status: "PROCESSING", note: `Provider ${so.supplier.name} refused: ${r.message}`.slice(0, 500) } }),
  ]);
  const v = so.orderItem.variant;
  const backupUsed = so.orderItem.supplierOrders.some((x) => x.supplierId === v.backupSupplierId);
  if (v.backupSupplierId && v.backupSupplier?.isEnabled && v.backupSupplierSku && !backupUsed) {
    const attempt = so.orderItem.supplierOrders.length + 1;
    const next = await prisma.supplierOrder.create({ data: { supplierId: v.backupSupplierId, orderItemId: so.orderItemId, ref: `hv-${so.orderItemId}-${attempt}`, sku: v.backupSupplierSku } });
    await prisma.orderEvent.create({ data: { orderId: so.orderItem.orderId, status: "PROCESSING", note: `Sent to backup provider ${v.backupSupplier.name}` } });
    const claim = await prisma.supplierOrder.updateMany({ where: { id: next.id, status: "QUEUED" }, data: { status: "SENDING" } });
    if (claim.count === 1) await sendSmm(await prisma.supplierOrder.findUniqueOrThrow({ where: { id: next.id }, include: smmInclude }));
    return;
  }
  await refundUndelivered(so, lineQuantity(fields), `Provider refused: ${r.message}`);
}

/** Cost in the provider's currency and in HTG centimes at today's rate. */
async function costData(usd: number) {
  const { htgPerUsd } = await getSettings();
  return { costUsd: usd, costHtg: Math.round(usd * htgPerUsd * 100) };
}

/** Everything (or the rest) goes back to the wallet; the order is closed as refunded or partly delivered. */
async function refundUndelivered(so: SmmOrder, remains: number, reason: string) {
  const fields = (so.orderItem.fieldValues ?? {}) as Record<string, string>;
  const qty = lineQuantity(fields);
  const order = so.orderItem.order;
  const lines = await prisma.orderItem.count({ where: { orderId: order.id } });
  if ((remains >= qty || qty === 0) && lines <= 1) {
    const { refundOrCancel } = await import("../orders");
    await refundOrCancel(order.id, null, reason).catch((e) => console.error("SMM refund failed", order.id, e));
    return;
  }
  if (remains >= qty || qty === 0) {
    // One line of a pack (several lines): only that line's share goes back; the rest of the order carries on.
    const amount = so.orderItem.unitPrice * so.orderItem.quantity;
    const allFailed = await prisma.$transaction(async (tx) => {
      await refundPart(tx, order, amount, so.orderItemId, reason);
      await tx.supplierOrder.update({ where: { id: so.id }, data: { refundedPartial: amount } });
      await tx.orderItem.update({ where: { id: so.orderItemId }, data: { status: "FAILED" } });
      await tx.orderEvent.create({ data: { orderId: order.id, status: "PROCESSING", note: `One line not delivered: ${formatMoney(amount, order.currency, "en")} back to the wallet` } });
      const left = await tx.orderItem.count({ where: { orderId: order.id, status: { not: "FAILED" } } });
      if (left === 0) {
        await tx.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
        await tx.orderEvent.create({ data: { orderId: order.id, status: "REFUNDED", note: reason } });
      }
      return left === 0;
    });
    if (allFailed) await notify(order.userId, "order_refunded", { number: order.number }, `/account/orders/${order.id}`);
    else {
      await notify(order.userId, "order_partial", { number: order.number, amount, currency: order.currency }, `/account/orders/${order.id}`);
      const { fulfillOrder } = await import("../orders");
      await fulfillOrder(order.id).catch((e) => console.error("finish order failed", order.id, e));
    }
    return;
  }
  const amount = partialRefund(so.orderItem.unitPrice * so.orderItem.quantity, qty, remains);
  await prisma.$transaction(async (tx) => {
    await refundPart(tx, order, amount, so.orderItemId, reason);
    await tx.supplierOrder.update({ where: { id: so.id }, data: { refundedPartial: amount } });
    await tx.orderItem.update({ where: { id: so.orderItemId }, data: { status: "DELIVERED" } }); // the customer sees the partial note in their language
    await tx.orderEvent.create({ data: { orderId: order.id, status: "PROCESSING", note: `Partly delivered (${qty - remains}/${qty}): ${formatMoney(amount, order.currency, "en")} back to the wallet` } });
  });
  await notify(order.userId, "order_partial", { number: order.number, amount, currency: order.currency }, `/account/orders/${order.id}`);
}

/** Save one status reply. Returns the order id when the line is finished (delivered fully or partly). */
export async function applySmm(so: SmmOrder, p: SmmProgress | undefined): Promise<string | null> {
  const base = { lockedUntil: null, checks: { increment: 1 } } as const;
  if (!p || p.error) {
    const tooOld = Date.now() - so.createdAt.getTime() > GIVE_UP_MS;
    await prisma.supplierOrder.update({ where: { id: so.id }, data: { ...base, message: (p?.error ?? "No answer for this order").slice(0, 500), nextCheckAt: tooOld ? null : nextCheck(so.checks) } });
    return null;
  }
  const progress = { startCount: p.startCount, remains: p.remains, ...(p.charge !== null && Number.isFinite(p.charge) && p.charge >= 0 ? await costData(p.charge) : {}) };
  const outcome = smmOutcome(p.status);
  const fields = (so.orderItem.fieldValues ?? {}) as Record<string, string>;
  const qty = lineQuantity(fields);
  if (outcome === "done") {
    await prisma.$transaction([
      prisma.supplierOrder.update({ where: { id: so.id }, data: { ...base, ...progress, remains: 0, status: "SUCCESS", message: null, nextCheckAt: null } }),
      prisma.orderItem.update({ where: { id: so.orderItemId }, data: { status: "DELIVERED" } }),
    ]);
    return so.orderItem.orderId;
  }
  if (outcome === "partial" || outcome === "canceled") {
    const remains = outcome === "canceled" && p.remains === null ? qty : Math.max(0, p.remains ?? 0);
    const claim = await prisma.supplierOrder.updateMany({ where: { id: so.id, status: { in: ["PENDING", "UNKNOWN", "SENDING"] } }, data: { status: remains >= qty ? "FAILED" : "SUCCESS", ...progress, remains, lockedUntil: null, nextCheckAt: null, message: `Provider: ${p.status}` } });
    if (claim.count !== 1) return null; // already handled
    await refundUndelivered(so, remains, outcome === "canceled" ? "Canceled by the provider" : "Partly delivered by the provider");
    return remains >= qty ? null : so.orderItem.orderId;
  }
  await prisma.supplierOrder.update({ where: { id: so.id }, data: { ...base, ...progress, status: "PENDING", message: p.status || null, nextCheckAt: Date.now() - so.createdAt.getTime() > GIVE_UP_MS ? null : nextCheck(so.checks) } });
  return null;
}

/** Cron: one status call per provider for every order that is due (up to 100 per call). */
export async function runSmmChecks(ids?: string[]): Promise<string[]> {
  const due = await prisma.supplierOrder.findMany({
    where: ids ? { id: { in: ids }, status: { in: ["PENDING", "UNKNOWN"] } } : { status: "PENDING", nextCheckAt: { lte: new Date() }, supplier: { preset: { in: ["smm_panel", "smm_mock"] } } },
    include: smmInclude,
    take: ids ? undefined : 300,
  });
  const finished: string[] = [];
  const bySupplier = new Map<string, SmmOrder[]>();
  for (const so of due) if (so.supplierOrderId) bySupplier.set(so.supplierId, [...(bySupplier.get(so.supplierId) ?? []), so]);
  for (const list of bySupplier.values()) {
    const statuses = await smmStatuses(list[0].supplier, list.map((x) => x.supplierOrderId!));
    for (const so of list) {
      const done = await applySmm(so, statuses.get(so.supplierOrderId!)).catch((e) => (console.error("SMM apply failed", so.id, e), null));
      if (done) finished.push(done);
    }
  }
  if (!ids) await checkRefills().catch((e) => console.error("SMM refill checks failed", e));
  return finished;
}

/** Refills asked in the last 7 days: follow their status (every 30 minutes at most) until the provider finishes them. */
async function checkRefills() {
  const open = await prisma.supplierOrder.findMany({
    where: { refillId: { not: null }, refillStatus: { notIn: ["Completed", "Rejected", "Canceled", "Error"] }, refillAt: { gt: new Date(Date.now() - 7 * 86_400_000) }, updatedAt: { lt: new Date(Date.now() - 30 * 60_000) } },
    include: { supplier: true },
    take: 50,
  });
  for (const so of open) {
    const st = await smmRefillStatus(so.supplier, so.refillId!);
    await prisma.supplierOrder.update({ where: { id: so.id }, data: { refillStatus: st ?? so.refillStatus } });
  }
}

/** Customer "Refill" on a completed order: sent to the provider when the service has refill and the period isn't over. */
export async function requestSmmRefill(orderItemId: string, refillDays: number): Promise<"sent" | "not_linked" | "expired" | "too_soon" | "refused"> {
  const so = await prisma.supplierOrder.findFirst({ where: { orderItemId, status: "SUCCESS", supplierOrderId: { not: null } }, include: { supplier: true, orderItem: { select: { order: { select: { fulfilledAt: true } } } } }, orderBy: { createdAt: "desc" } });
  if (!so || !isSmm(so.supplier.preset)) return "not_linked";
  // The refill period counts from delivery (the order's completion date), not from later updates of this row.
  const deliveredAt = so.orderItem.order.fulfilledAt ?? so.createdAt;
  if (refillDays <= 0 || Date.now() - deliveredAt.getTime() > refillDays * 86_400_000) return "expired";
  if (so.refillAt && Date.now() - so.refillAt.getTime() < 86_400_000) return "too_soon";
  const r = await smmRefill(so.supplier, so.supplierOrderId!, so.id);
  if (!r.ok) return "refused";
  await prisma.supplierOrder.update({ where: { id: so.id }, data: { refillId: r.refillId, refillStatus: "Pending", refillAt: new Date() } });
  return "sent";
}

/** Customer "Cancel" on a running order: asked at the provider; the money comes back when the provider reports Canceled. */
export async function requestSmmCancel(orderItemId: string): Promise<"sent" | "not_linked" | "refused"> {
  const so = await prisma.supplierOrder.findFirst({ where: { orderItemId, status: "PENDING", supplierOrderId: { not: null } }, include: { supplier: true } });
  if (!so || !isSmm(so.supplier.preset)) return "not_linked";
  const r = await smmCancel(so.supplier, so.supplierOrderId!, so.id);
  if (!r.ok) return "refused";
  await prisma.supplierOrder.update({ where: { id: so.id }, data: { cancelAt: new Date(), nextCheckAt: new Date() } });
  return "sent";
}
