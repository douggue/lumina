import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { encrypt, hmac } from "../crypto";
import { getSettings } from "../settings";
import { ytAdd, ytOutcome, ytResult, ytStatus } from "./ytseller";

/**
 * YTSeller account / SMS orders (preset ytseller), on top of supplier order steps in orders.ts:
 *   sent with trans_id = our ref → PENDING (or SUCCESS if Instant + result already there)
 *   Completed → result_product → CodeItem rows (AES-GCM), line DELIVERED
 *   Canceled → FAILED (staff refunds)
 * Resend of the same ref never double-buys (provider idempotency via trans_id).
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

/** Persist delivered login/SMS lines encrypted (same pattern as CodeItem / generic supplier codes). */
async function deliverLines(so: YtOrder, lines: string[], supplierOrderId: string, message?: string | null) {
  await prisma.$transaction(async (tx) => {
    for (const [i, line] of lines.entries()) {
      await tx.codeItem.create({
        data: {
          variantId: so.orderItem.variantId,
          codeEncrypted: encrypt(line),
          codeHash: hmac(`ytseller:${so.id}:${i}:${line}`),
          status: "ASSIGNED",
          assignedAt: new Date(),
          orderItemId: so.orderItemId,
          batchLabel: `ytseller:${so.supplier.name}`,
        },
      });
    }
    await tx.supplierOrder.update({
      where: { id: so.id },
      data: { status: "SUCCESS", supplierOrderId, message: message?.slice(0, 500) ?? null, nextCheckAt: null, lockedUntil: null },
    });
    await tx.orderItem.update({ where: { id: so.orderItemId }, data: { status: "DELIVERED" } });
  });
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
    const ps = await prisma.providerService.findUnique({ where: { supplierId_serviceId: { supplierId: so.supplierId, serviceId: productId } }, select: { rate: true } });
    const costUsd = ps ? Number(ps.rate) * qty : null;
    // Instant products may already be done: pull result now.
    const st = await ytStatus(so.supplier, r.orderId, so.id);
    if (!st.error && ytOutcome(st.status) === "done") {
      const res = await ytResult(so.supplier, r.orderId, so.id);
      if (res.lines.length) {
        await deliverLines(so, res.lines, r.orderId);
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
    // May already exist under our trans_id: leave UNKNOWN and let checks / staff resolve; never re-add blindly.
    await prisma.supplierOrder.update({
      where: { id: so.id },
      data: { status: "UNKNOWN", message: `No clear answer (${r.message}). Will check; do not re-order.`.slice(0, 500), lockedUntil: null, nextCheckAt: nextCheck(0) },
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
    where: { id, status: { in: force ? ["PENDING", "UNKNOWN", "FAILED"] : ["PENDING", "UNKNOWN"] }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }] },
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
    // Interrupted before we got an id: ask status is impossible without provider id; staff must close or retry with new ref.
    await prisma.supplierOrder.update({ where: { id }, data: { lockedUntil: null, nextCheckAt: null, message: "No provider order id yet: check on YTSeller or retry with a new reference" } });
    return null;
  }
  const st = await ytStatus(so.supplier, orderId, so.id);
  if (st.error) {
    await prisma.supplierOrder.update({ where: { id }, data: { lockedUntil: null, nextCheckAt: nextCheck(so.checks), message: st.error.slice(0, 500) } });
    return null;
  }
  const outcome = ytOutcome(st.status);
  if (outcome === "done") {
    const res = await ytResult(so.supplier, orderId, so.id);
    if (!res.lines.length) {
      await prisma.supplierOrder.update({
        where: { id },
        data: { lockedUntil: null, status: "UNKNOWN", nextCheckAt: nextCheck(so.checks), message: res.error ?? "Completed but no result lines yet", supplierOrderId: orderId },
      });
      return null;
    }
    await deliverLines(so, res.lines, orderId, st.status);
    if (st.charge != null && Number.isFinite(st.charge)) await prisma.supplierOrder.update({ where: { id }, data: await costData(st.charge) });
    return so.orderItem.orderId;
  }
  if (outcome === "canceled") {
    await prisma.$transaction([
      prisma.supplierOrder.update({ where: { id }, data: { status: "FAILED", lockedUntil: null, nextCheckAt: null, message: (st.error || st.status).slice(0, 500), supplierOrderId: orderId } }),
      prisma.orderEvent.create({ data: { orderId: so.orderItem.orderId, status: "PROCESSING", note: `YTSeller ${st.status}`.slice(0, 500) } }),
    ]);
    return null;
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
