import "server-only";
import type { Prisma, SupplierOrderStatus } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { encrypt, hmac } from "../crypto";
import { siteUrl } from "../site-url";
import { callSupplier } from "./engine";
import type { CallResult, SupplierConfig } from "./types";
import { isSmm, runSmmChecks, sendSmm, smmInclude } from "./smm-orders";
import { checkYtseller, isYtseller, runYtsellerChecks, sendYtseller, ytInclude } from "./ytseller-orders";

const SMM_PRESETS = ["smm_panel", "smm_mock"];
const SPECIAL_PRESETS = [...SMM_PRESETS, "ytseller"];

/**
 * Supplier orders, step by step:
 *   QUEUED → SENDING → SUCCESS (codes saved, line delivered)
 *                    → PENDING / UNKNOWN → checked with "status" (1, 2, 5, 10, then every 30 min, up to 48 h)
 *                    → FAILED (staff: retry, deliver by hand or refund)
 * The same reference is used on every check, and an order that may have reached the supplier is never sent again
 * by itself, so a customer can't be delivered twice. Refunds are never automatic while a supplier order is open.
 */
export const OPEN: SupplierOrderStatus[] = ["QUEUED", "SENDING", "PENDING", "UNKNOWN"];
const BACKOFF_MIN = [1, 2, 5, 10, 30];
const GIVE_UP_MS = 48 * 3_600_000;

const nextCheck = (checks: number) => new Date(Date.now() + BACKOFF_MIN[Math.min(checks, BACKOFF_MIN.length - 1)] * 60_000);

/** Inside fulfillOrder's transaction: one supplier order per supplier line that doesn't have one yet. */
export async function queueSupplierLines(tx: Tx, orderId: string) {
  const items = await tx.orderItem.findMany({
    where: { orderId, status: "PENDING", supplierOrders: { none: {} }, variant: { supplierId: { not: null }, product: { fulfillmentType: "SUPPLIER_API" } } },
    select: { id: true, variant: { select: { supplierId: true, supplierSku: true, supplier: { select: { isEnabled: true } } } } },
  });
  for (const i of items) {
    if (!i.variant.supplierId || !i.variant.supplier?.isEnabled) continue;
    // The service id is kept on the attempt, so changing the choice's link later doesn't touch orders already placed.
    await tx.supplierOrder.create({ data: { supplierId: i.variant.supplierId, orderItemId: i.id, ref: `hv-${i.id}`, sku: i.variant.supplierSku } });
  }
}

type Full = Prisma.SupplierOrderGetPayload<{ include: { supplier: true; orderItem: { include: { order: { include: { user: { select: { email: true; name: true } } } }; variant: true } } } }>;
const include = { supplier: true, orderItem: { include: { order: { include: { user: { select: { email: true, name: true } } } }, variant: true } } } as const;

function context(so: Full): Record<string, unknown> {
  const item = so.orderItem;
  return {
    ref: so.ref,
    supplierOrderId: so.supplierOrderId ?? "",
    sku: item.variant.supplierSku ?? "",
    // "1234:25" → skuParts.0 = "1234", skuParts.1 = "25" (product id + amount for suppliers that need both)
    skuParts: (item.variant.supplierSku ?? "").split(":"),
    quantity: item.quantity,
    fields: item.fieldValues ?? {},
    orderNumber: item.order.number,
    email: item.order.user.email,
    name: item.order.user.name,
    callbackUrl: `${siteUrl()}/api/suppliers/callback/${so.supplier.callbackToken}`,
  };
}

/** Save the result of a call. Returns true when the line was delivered. */
async function apply(so: Full, r: CallResult): Promise<boolean> {
  const base = { supplierOrderId: r.supplierOrderId || so.supplierOrderId, message: r.message?.slice(0, 500) ?? null, lockedUntil: null };
  if (r.outcome === "SUCCESS") {
    let codes = r.codes;
    const cfg = so.supplier.config as unknown as SupplierConfig;
    if (!codes.length && cfg.codes) {
      const c = await callSupplier(so.supplierId, "codes", { ...context(so), supplierOrderId: base.supplierOrderId ?? "" }, so.id);
      codes = c.codes;
      if (c.outcome === "UNKNOWN" || (c.outcome !== "SUCCESS" && !codes.length)) {
        // Paid at the supplier but codes not fetched yet: keep checking, never re-order.
        await prisma.supplierOrder.update({ where: { id: so.id }, data: { ...base, status: "UNKNOWN", message: "Waiting for codes", nextCheckAt: nextCheck(so.checks) } });
        return false;
      }
    }
    await prisma.$transaction(async (tx) => {
      for (const [i, c] of codes.entries()) {
        const text = [c.code, c.pin && `PIN: ${c.pin}`, c.serial && `Serial: ${c.serial}`, c.expiry && `Exp: ${c.expiry}`].filter(Boolean).join(" · ");
        await tx.codeItem.create({
          data: { variantId: so.orderItem.variantId, codeEncrypted: encrypt(text), codeHash: hmac(`supplier:${so.id}:${i}:${c.code}`), status: "ASSIGNED", assignedAt: new Date(), orderItemId: so.orderItemId, batchLabel: `supplier:${so.supplier.name}` },
        });
      }
      await tx.supplierOrder.update({ where: { id: so.id }, data: { ...base, status: "SUCCESS", nextCheckAt: null } });
      await tx.orderItem.update({ where: { id: so.orderItemId }, data: { status: "DELIVERED" } });
    });
    return true;
  }
  if (r.outcome === "FAILED") {
    await prisma.$transaction([
      prisma.supplierOrder.update({ where: { id: so.id }, data: { ...base, status: "FAILED", nextCheckAt: null } }),
      prisma.orderEvent.create({ data: { orderId: so.orderItem.orderId, status: "PROCESSING", note: `Supplier ${so.supplier.name} failed: ${r.message ?? "no reason given"}`.slice(0, 500) } }),
    ]);
    return false;
  }
  const cfg = so.supplier.config as unknown as SupplierConfig;
  const canCheck = !!cfg.status;
  await prisma.supplierOrder.update({
    where: { id: so.id },
    data: {
      ...base,
      status: r.outcome === "PENDING" ? "PENDING" : "UNKNOWN",
      message: canCheck ? base.message : "This supplier has no status check: confirm on the supplier's site, then close it here",
      nextCheckAt: canCheck ? nextCheck(so.checks) : null,
    },
  });
  return false;
}

/** Send the queued lines of an order (or every queued line). Safe to call twice: each line is claimed once. */
export async function sendQueued(orderId?: string): Promise<string[]> {
  const queued = await prisma.supplierOrder.findMany({ where: { status: "QUEUED", ...(orderId ? { orderItem: { orderId } } : {}) }, select: { id: true }, take: 20 });
  const delivered: string[] = [];
  for (const q of queued) {
    const claim = await prisma.supplierOrder.updateMany({ where: { id: q.id, status: "QUEUED" }, data: { status: "SENDING" } });
    if (claim.count !== 1) continue;
    const smm = await prisma.supplierOrder.findUniqueOrThrow({ where: { id: q.id }, include: smmInclude });
    if (isSmm(smm.supplier.preset)) {
      // SMM orders are never delivered on the spot: progress comes from the status checks.
      await sendSmm(smm).catch(async (e) => {
        console.error("SMM send failed", q.id, e);
        await prisma.supplierOrder.updateMany({ where: { id: q.id, status: "SENDING" }, data: { status: "UNKNOWN", nextCheckAt: null, message: "Sending stopped with an error: check on the provider's site, then close or retry here" } });
      });
      continue;
    }
    if (isYtseller(smm.supplier.preset)) {
      const yt = await prisma.supplierOrder.findUniqueOrThrow({ where: { id: q.id }, include: ytInclude });
      try {
        if ((await sendYtseller(yt)) === "delivered") delivered.push(yt.orderItem.orderId);
      } catch (e) {
        console.error("YTSeller send failed", q.id, e);
        await prisma.supplierOrder.updateMany({ where: { id: q.id, status: "SENDING" }, data: { status: "UNKNOWN", nextCheckAt: new Date(), message: "Sending stopped with an error: checking with YTSeller (trans_id kept)" } });
      }
      continue;
    }
    const so = await prisma.supplierOrder.findUniqueOrThrow({ where: { id: q.id }, include });
    let r: CallResult;
    try {
      r = await callSupplier(so.supplierId, "order", context(so), so.id);
    } catch (e) {
      // Not sent (bad settings, login failed): back to the queue for staff to look at.
      await prisma.supplierOrder.update({ where: { id: so.id }, data: { status: "FAILED", message: (e instanceof Error ? e.message : "Could not send").slice(0, 500) } });
      continue;
    }
    if (await apply(so, r)) delivered.push(so.orderItem.orderId);
  }
  return delivered;
}

/** Ask the supplier where an order is. Returns the order id if the line got delivered. */
export async function checkSupplierOrder(id: string, force = false): Promise<string | null> {
  const row = await prisma.supplierOrder.findUnique({ where: { id }, select: { supplier: { select: { preset: true } } } });
  if (row && isSmm(row.supplier.preset)) return (await runSmmChecks([id]))[0] ?? null;
  if (row && isYtseller(row.supplier.preset)) return checkYtseller(id, force);
  const claim = await prisma.supplierOrder.updateMany({
    where: { id, status: { in: force ? ["PENDING", "UNKNOWN", "FAILED"] : ["PENDING", "UNKNOWN"] }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }] },
    data: { lockedUntil: new Date(Date.now() + 60_000), checks: { increment: 1 } },
  });
  if (claim.count !== 1) return null;
  const so = await prisma.supplierOrder.findUniqueOrThrow({ where: { id }, include });
  const cfg = so.supplier.config as unknown as SupplierConfig;
  if (!cfg.status) {
    await prisma.supplierOrder.update({ where: { id }, data: { lockedUntil: null } });
    return null;
  }
  let r: CallResult;
  try {
    r = await callSupplier(so.supplierId, "status", context(so), so.id);
  } catch (e) {
    r = { outcome: "UNKNOWN", httpStatus: null, message: e instanceof Error ? e.message : "Check failed", codes: [], raw: "" };
  }
  // A status check can't turn a failure into a new attempt: FAILED from a check is only kept if the order was open.
  if (so.status === "FAILED" && r.outcome !== "SUCCESS") {
    await prisma.supplierOrder.update({ where: { id }, data: { lockedUntil: null, message: r.message?.slice(0, 500) ?? so.message } });
    return null;
  }
  if (Date.now() - so.createdAt.getTime() > GIVE_UP_MS && r.outcome !== "SUCCESS" && r.outcome !== "FAILED") {
    await prisma.supplierOrder.update({ where: { id }, data: { status: so.status === "PENDING" ? "PENDING" : "UNKNOWN", lockedUntil: null, nextCheckAt: null, message: "Stopped checking after 48 h: confirm on the supplier's site" } });
    return null;
  }
  return (await apply(so, r)) ? so.orderItem.orderId : null;
}

/** Cron: send what's queued, recover interrupted sends, run due checks. */
export async function runSupplierCron() {
  const now = Date.now();
  // A send interrupted mid-way (server stopped) may or may not have reached the supplier: check, don't re-send.
  const stale = new Date(now - 2 * 60_000);
  const interrupted = await prisma.supplierOrder.updateMany({
    where: { status: "SENDING", updatedAt: { lt: stale }, supplier: { preset: { notIn: SPECIAL_PRESETS } } },
    data: { status: "UNKNOWN", nextCheckAt: new Date(), message: "Sending was interrupted: checking with the supplier" },
  });
  // SMM panels can't be asked about an order by our reference: an interrupted send goes to staff.
  const smmInterrupted = await prisma.supplierOrder.updateMany({
    where: { status: "SENDING", updatedAt: { lt: stale }, supplier: { preset: { in: SMM_PRESETS } } },
    data: { status: "UNKNOWN", nextCheckAt: null, message: "Sending was interrupted: check on the provider's site, then close or retry here" },
  });
  // YTSeller uses trans_id: interrupted send can be reconciled via status / never re-add blindly.
  const ytInterrupted = await prisma.supplierOrder.updateMany({
    where: { status: "SENDING", updatedAt: { lt: stale }, supplier: { preset: "ytseller" } },
    data: { status: "UNKNOWN", nextCheckAt: new Date(), message: "Sending was interrupted: checking with YTSeller" },
  });
  const delivered = await sendQueued();
  delivered.push(...(await runSmmChecks().catch((e) => (console.error("SMM checks failed", e), []))));
  delivered.push(...(await runYtsellerChecks().catch((e) => (console.error("YTSeller checks failed", e), []))));
  const due = await prisma.supplierOrder.findMany({ where: { status: { in: ["PENDING", "UNKNOWN"] }, nextCheckAt: { lte: new Date() }, supplier: { preset: { notIn: SPECIAL_PRESETS } } }, select: { id: true }, orderBy: { nextCheckAt: "asc" }, take: 30 });
  for (const d of due) {
    const o = await checkSupplierOrder(d.id).catch((e) => (console.error("supplier check failed", d.id, e), null));
    if (o) delivered.push(o);
  }
  await finishOrders(delivered);
  return { supplierInterrupted: interrupted.count + smmInterrupted.count + ytInterrupted.count, supplierChecked: due.length, supplierDelivered: delivered.length };
}

/** After lines were delivered: let fulfillOrder close the order and tell the customer. */
export async function finishOrders(orderIds: string[]) {
  const { fulfillOrder } = await import("../orders");
  for (const id of new Set(orderIds)) await fulfillOrder(id).catch((e) => console.error("finish order failed", id, e));
}

/** Staff: send a failed line again with a new reference (the old one stays failed at the supplier). */
export async function retrySupplierLine(supplierOrderId: string) {
  const so = await prisma.supplierOrder.findUniqueOrThrow({ where: { id: supplierOrderId }, include: { orderItem: { select: { status: true, orderId: true, supplierOrders: { select: { status: true } } } } } });
  if (so.status !== "FAILED") throw new Error("Only a failed supplier order can be sent again");
  if (so.orderItem.status !== "PENDING") throw new Error("This line is already delivered");
  if (so.orderItem.supplierOrders.some((x) => OPEN.includes(x.status))) throw new Error("Another attempt for this line is still open");
  const attempt = so.orderItem.supplierOrders.length + 1;
  await prisma.$transaction([
    prisma.supplierOrder.update({ where: { id: so.id }, data: { status: "CLOSED" } }),
    prisma.supplierOrder.create({ data: { supplierId: so.supplierId, orderItemId: so.orderItemId, ref: `hv-${so.orderItemId}-${attempt}`, sku: so.sku } }),
  ]);
  const delivered = await sendQueued(so.orderItem.orderId);
  await finishOrders(delivered);
  return so.orderItem.orderId;
}

/** Staff: stop following a supplier order (delivered by hand, refunded, or confirmed on the supplier's site). */
export async function closeSupplierLine(supplierOrderId: string, note: string) {
  await prisma.supplierOrder.update({ where: { id: supplierOrderId }, data: { status: "CLOSED", nextCheckAt: null, lockedUntil: null, message: note.slice(0, 500) || "Closed by staff" } });
}

/** True while a supplier might still deliver this order: refunds must wait. */
export async function hasOpenSupplierOrder(orderId: string, db: Tx = prisma) {
  return (await db.supplierOrder.count({ where: { orderItem: { orderId }, status: { in: OPEN } } })) > 0;
}
