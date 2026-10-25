import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { decrypt, encrypt, hmac } from "../crypto";
import { formatMoney } from "../money";
import { notify } from "../notify";
import { getSettings } from "../settings";
import { refundPart } from "../wallet";
import { ytAdd, ytOutcome, ytPartialRefund, ytResult, ytStatus } from "./ytseller";

/**
 * YTSeller account / SMS orders (preset ytseller), on top of supplier order steps in orders.ts:
 *   sent with trans_id = our ref → PENDING (or SUCCESS if Instant + result already there)
 *   Completed → result_product → CodeItem rows (AES-GCM), line DELIVERED
 *   Partial / Canceled → deliver what we have + auto-refund the rest (same idea as SMM)
 * Resend of the same ref never double-buys (provider idempotency via trans_id).
 * Customer can refreshDeliveryCodes to pull new SMS lines after the first delivery.
 */
export const isYtseller = (preset: string) => preset === "ytseller";

const CHECK_MIN = [1, 2, 5, 10, 30];
const GIVE_UP_MS = 48 * 3_600_000;
const nextCheck = (checks: number) => new Date(Date.now() + CHECK_MIN[Math.min(checks, CHECK_MIN.length - 1)] * 60_000);

export const ytInclude = {
  supplier: true,
  orderItem: { include: { order: true, variant: true } },
} as const;
export type YtOrder = Prisma.SupplierOrderGetPayload<{ include: typeof ytInclude }>;

async function costData(costUsd: number) {
  const { htgPerUsd } = await getSettings();
  return { costUsd, costHtg: Math.round(costUsd * htgPerUsd * 100) };
}

function lineQuantity(fields: Record<string, string>) {
  return Math.max(1, Number(fields.quantity) || 1);
}


/** Persist new login/SMS lines (skip duplicates already on this order line). Returns how many were added. */
async function appendLines(so: YtOrder, lines: string[], supplierOrderId: string, opts: { finalize: boolean; message?: string | null; remains?: number | null }) {
  const existing = await prisma.codeItem.findMany({ where: { orderItemId: so.orderItemId }, select: { codeEncrypted: true } });
  const have = new Set(existing.map((c) => decrypt(c.codeEncrypted)));
  const fresh = lines.map((l) => l.trim()).filter((l) => l && !have.has(l));
  await prisma.$transaction(async (tx) => {
    for (const [i, line] of fresh.entries()) {
      await tx.codeItem.create({
        data: {
          variantId: so.orderItem.variantId,
          codeEncrypted: encrypt(line),
          codeHash: hmac(`ytseller:${so.id}:line:${line}`),
          status: "ASSIGNED",
          assignedAt: new Date(),
          orderItemId: so.orderItemId,
          batchLabel: `ytseller:${so.supplier.name}`,
        },
      });
      void i;
    }
    if (opts.finalize) {
      await tx.supplierOrder.update({
        where: { id: so.id },
        data: {
          status: "SUCCESS",
          supplierOrderId,
          message: opts.message?.slice(0, 500) ?? null,
          nextCheckAt: null,
          lockedUntil: null,
          ...(opts.remains != null ? { remains: opts.remains } : {}),
        },
      });
      await tx.orderItem.update({ where: { id: so.orderItemId }, data: { status: "DELIVERED" } });
    } else if (fresh.length) {
      await tx.supplierOrder.update({
        where: { id: so.id },
        data: { supplierOrderId, message: opts.message?.slice(0, 500) ?? so.message, lockedUntil: null },
      });
    }
  });
  return fresh.length;
}

/** Full or partial refund when the provider cancels or only partly delivers. */
async function refundUndelivered(so: YtOrder, remains: number, reason: string) {
  const fields = (so.orderItem.fieldValues ?? {}) as Record<string, string>;
  const qty = lineQuantity(fields);
  const order = so.orderItem.order;
  const lines = await prisma.orderItem.count({ where: { orderId: order.id } });
  if ((remains >= qty || qty === 0) && lines <= 1) {
    const { refundOrCancel } = await import("../orders");
    await refundOrCancel(order.id, null, reason).catch((e) => console.error("YTSeller refund failed", order.id, e));
    return;
  }
  if (remains >= qty || qty === 0) {
    const amount = so.orderItem.unitPrice * so.orderItem.quantity;
    const allFailed = await prisma.$transaction(async (tx) => {
      await refundPart(tx, order, amount, so.orderItemId, reason);
      await tx.supplierOrder.update({ where: { id: so.id }, data: { refundedPartial: amount } });
      await tx.orderItem.update({ where: { id: so.orderItemId }, data: { status: "FAILED" } });
      await tx.orderEvent.create({
        data: { orderId: order.id, status: "PROCESSING", note: `One line not delivered: ${formatMoney(amount, order.currency, "en")} back to the wallet` },
      });
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
  const amount = ytPartialRefund(so.orderItem.unitPrice * so.orderItem.quantity, qty, remains);
  if (amount <= 0) return;
  await prisma.$transaction(async (tx) => {
    await refundPart(tx, order, amount, so.orderItemId, reason);
    await tx.supplierOrder.update({ where: { id: so.id }, data: { refundedPartial: amount } });
    await tx.orderItem.update({ where: { id: so.orderItemId }, data: { status: "DELIVERED" } });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        status: "PROCESSING",
        note: `Partly delivered (${qty - remains}/${qty}): ${formatMoney(amount, order.currency, "en")} back to the wallet`,
      },
    });
  });
  await notify(order.userId, "order_partial", { number: order.number, amount, currency: order.currency }, `/account/orders/${order.id}`);
}

export async function sendYtseller(so: YtOrder): Promise<"delivered" | "pending" | "failed"> {
  const fields = (so.orderItem.fieldValues ?? {}) as Record<string, string>;
  const productId = (so.sku ?? so.orderItem.variant.supplierSku ?? "").trim();
  const qty = Math.max(1, Number(fields.quantity) || 1);
  if (!productId) {
    await prisma.supplierOrder.update({ where: { id: so.id }, data: { status: "FAILED", message: "No YTSeller product linked to this choice", lockedUntil: null, nextCheckAt: null } });
    return "failed";
  }
  const r = await ytAdd(so.supplier, { productId, quantity: qty, transId: so.ref, fields }, so.id);
  if (r.result === "ok") {
    const ps = await prisma.providerService.findUnique({
      where: { supplierId_serviceId: { supplierId: so.supplierId, serviceId: productId } },
      select: { rate: true },
    });
    const costUsd = ps ? Number(ps.rate) * qty : null;
    const st = await ytStatus(so.supplier, r.orderId, so.id);
    if (!st.error && ytOutcome(st.status) === "done") {
      const res = await ytResult(so.supplier, r.orderId, so.id);
      if (res.lines.length) {
        await appendLines(so, res.lines, r.orderId, { finalize: true });
        if (costUsd !== null) await prisma.supplierOrder.update({ where: { id: so.id }, data: await costData(st.charge ?? costUsd) });
        return "delivered";
      }
    }
    await prisma.supplierOrder.update({
      where: { id: so.id },
      data: {
        status: "PENDING",
        supplierOrderId: r.orderId,
        message: null,
        lockedUntil: null,
        nextCheckAt: nextCheck(0),
        ...(costUsd !== null ? await costData(costUsd) : {}),
      },
    });
    return "pending";
  }
  if (r.result === "unknown") {
    await prisma.supplierOrder.update({
      where: { id: so.id },
      data: {
        status: "UNKNOWN",
        message: `No clear answer (${r.message}). Will check; do not re-order.`.slice(0, 500),
        lockedUntil: null,
        nextCheckAt: nextCheck(0),
      },
    });
    return "pending";
  }
  await prisma.$transaction([
    prisma.supplierOrder.update({ where: { id: so.id }, data: { status: "FAILED", message: r.message.slice(0, 500), lockedUntil: null, nextCheckAt: null } }),
    prisma.orderEvent.create({ data: { orderId: so.orderItem.orderId, status: "PROCESSING", note: `YTSeller refused: ${r.message}`.slice(0, 500) } }),
  ]);
  return "failed";
}

export async function checkYtseller(id: string, force = false): Promise<string | null> {
  const claim = await prisma.supplierOrder.updateMany({
    where: {
      id,
      status: { in: force ? ["PENDING", "UNKNOWN", "FAILED"] : ["PENDING", "UNKNOWN"] },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }],
    },
    data: { lockedUntil: new Date(Date.now() + 60_000), checks: { increment: 1 } },
  });
  if (claim.count !== 1) return null;
  const so = await prisma.supplierOrder.findUniqueOrThrow({ where: { id }, include: ytInclude });
  if (!isYtseller(so.supplier.preset)) {
    await prisma.supplierOrder.update({ where: { id }, data: { lockedUntil: null } });
    return null;
  }
  const orderId = so.supplierOrderId;
  if (!orderId) {
    await prisma.supplierOrder.update({
      where: { id },
      data: { lockedUntil: null, nextCheckAt: null, message: "No provider order id yet: check on YTSeller or retry with a new reference" },
    });
    return null;
  }
  const st = await ytStatus(so.supplier, orderId, so.id);
  if (st.error) {
    await prisma.supplierOrder.update({ where: { id }, data: { lockedUntil: null, nextCheckAt: nextCheck(so.checks), message: st.error.slice(0, 500) } });
    return null;
  }
  const outcome = ytOutcome(st.status);
  const fields = (so.orderItem.fieldValues ?? {}) as Record<string, string>;
  const qty = lineQuantity(fields);

  if (outcome === "done") {
    const res = await ytResult(so.supplier, orderId, so.id);
    if (!res.lines.length) {
      await prisma.supplierOrder.update({
        where: { id },
        data: {
          lockedUntil: null,
          status: "UNKNOWN",
          nextCheckAt: nextCheck(so.checks),
          message: res.error ?? "Completed but no result lines yet",
          supplierOrderId: orderId,
        },
      });
      return null;
    }
    await appendLines(so, res.lines, orderId, { finalize: true, message: st.status });
    if (st.charge != null && Number.isFinite(st.charge)) await prisma.supplierOrder.update({ where: { id }, data: await costData(st.charge) });
    return so.orderItem.orderId;
  }

  if (outcome === "partial" || outcome === "canceled") {
    const remains = outcome === "canceled" && st.remains == null ? qty : Math.max(0, st.remains ?? 0);
    const res = await ytResult(so.supplier, orderId, so.id).catch(() => ({ lines: [] as string[], error: undefined }));
    if (res.lines.length) await appendLines(so, res.lines, orderId, { finalize: remains < qty, message: st.status, remains });
    const claim2 = await prisma.supplierOrder.updateMany({
      where: { id, status: { in: ["PENDING", "UNKNOWN", "SENDING", "FAILED"] } },
      data: {
        status: remains >= qty ? "FAILED" : "SUCCESS",
        remains,
        lockedUntil: null,
        nextCheckAt: null,
        message: `Provider: ${st.status}`.slice(0, 500),
        supplierOrderId: orderId,
        ...(st.charge != null && Number.isFinite(st.charge) ? await costData(st.charge) : {}),
      },
    });
    if (claim2.count !== 1 && !res.lines.length) return null;
    // Reload after status flip so refund sees current row.
    const fresh = await prisma.supplierOrder.findUniqueOrThrow({ where: { id }, include: ytInclude });
    await refundUndelivered(fresh, remains, outcome === "canceled" ? "Canceled by the provider" : "Partly delivered by the provider");
    return remains >= qty ? null : so.orderItem.orderId;
  }

  if (Date.now() - so.createdAt.getTime() > GIVE_UP_MS) {
    await prisma.supplierOrder.update({ where: { id }, data: { lockedUntil: null, nextCheckAt: null, message: "Stopped checking after 48 h: confirm on YTSeller" } });
    return null;
  }
  await prisma.supplierOrder.update({
    where: { id },
    data: { status: "PENDING", lockedUntil: null, nextCheckAt: nextCheck(so.checks), message: st.status || so.message, supplierOrderId: orderId },
  });
  return null;
}

export async function runYtsellerChecks(ids?: string[]): Promise<string[]> {
  const due = await prisma.supplierOrder.findMany({
    where: ids
      ? { id: { in: ids }, status: { in: ["PENDING", "UNKNOWN"] } }
      : { status: "PENDING", nextCheckAt: { lte: new Date() }, supplier: { preset: "ytseller" } },
    select: { id: true },
    take: 30,
  });
  const delivered: string[] = [];
  for (const d of due) {
    const o = await checkYtseller(d.id).catch((e) => (console.error("YTSeller check failed", d.id, e), null));
    if (o) delivered.push(o);
  }
  return delivered;
}

/**
 * Customer/staff: pull result_product again (SMS numbers keep receiving codes).
 * Appends only new lines; never re-orders. Returns how many new codes were stored.
 */
export async function refreshYtsellerCodes(supplierOrderId: string): Promise<{ added: number; error?: string }> {
  const so = await prisma.supplierOrder.findUnique({ where: { id: supplierOrderId }, include: ytInclude });
  if (!so || !isYtseller(so.supplier.preset)) return { added: 0, error: "not_ytseller" };
  const orderId = so.supplierOrderId;
  if (!orderId) return { added: 0, error: "no_provider_id" };
  if (!["SUCCESS", "PENDING", "UNKNOWN"].includes(so.status)) return { added: 0, error: "status" };
  const res = await ytResult(so.supplier, orderId, so.id);
  if (res.error) return { added: 0, error: res.error };
  if (!res.lines.length) return { added: 0 };
  const added = await appendLines(so, res.lines, orderId, { finalize: so.status !== "SUCCESS" ? true : false, message: so.message });
  if (added && so.status !== "SUCCESS") {
    // appendLines already finalized when needed
  } else if (added && so.orderItem.status !== "DELIVERED") {
    await prisma.orderItem.update({ where: { id: so.orderItemId }, data: { status: "DELIVERED" } });
  }
  return { added };
}
