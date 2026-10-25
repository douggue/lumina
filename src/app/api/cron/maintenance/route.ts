import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMoncashIntent } from "@/lib/payments/verify";
import { releaseHold } from "@/lib/wallet";
import { notify } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import { refundOrCancel } from "@/lib/orders";
import { OPEN, runSupplierCron } from "@/lib/suppliers/orders";
import { syncAllProviders } from "@/lib/suppliers/catalog";
import { matureCommissions } from "@/lib/referrals";
import { smmBalance } from "@/lib/suppliers/smm";

/**
 * Scheduled maintenance (call every 5–10 minutes with `Authorization: Bearer $CRON_SECRET`, e.g. Vercel Cron or Inngest):
 * - re-checks pending MonCash payments in case a callback was lost
 * - releases held deposits whose hold period ended
 * - expires abandoned payment intents
 * - sends supplier orders and checks the ones still pending (see src/lib/suppliers/orders.ts)
 * - referral commissions whose hold is over go to the referrer's earnings
 * - SMM providers: balance every hour; once a day, service lists, risk levels, profit check and real average times
 * - refunds paid orders that were not delivered within `autoRefundHours` (nothing delivered, no open risk review,
 *   no supplier order still running)
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const result: Record<string, number> = { moncashChecked: 0, holdsReleased: 0, expired: 0, autoRefunded: 0 };
  try {
    Object.assign(result, await runSupplierCron());
  } catch (e) {
    console.error("Supplier cron failed", e);
  }
  try {
    result.commissionsReleased = await matureCommissions();
  } catch (e) {
    console.error("Referral commissions failed", e);
  }
  try {
    const smm = await prisma.supplier.findMany({ where: { isEnabled: true, preset: { in: ["smm_panel", "smm_mock"] } } });
    for (const s of smm) if (!s.balanceAt || now.getTime() - s.balanceAt.getTime() > 3_600_000) await smmBalance(s);
    const last = await prisma.providerService.aggregate({ _max: { seenAt: true } });
    if (smm.length && (!last._max.seenAt || now.getTime() - last._max.seenAt.getTime() > 86_400_000)) {
      await syncAllProviders();
      result.providersSynced = smm.length;
    }
  } catch (e) {
    console.error("Provider sync failed", e);
  }

  const pending = await prisma.paymentIntent.findMany({
    where: { provider: "MONCASH", status: "PENDING", createdAt: { gte: new Date(now.getTime() - 86_400_000) } },
    take: 50,
  });
  for (const p of pending) {
    try {
      await verifyMoncashIntent(p.id);
      result.moncashChecked++;
    } catch (e) {
      console.error("MonCash poll failed", p.id, e);
    }
  }

  const held = await prisma.paymentIntent.findMany({ where: { status: "SUCCEEDED", holdUntil: { lte: now } }, take: 100 });
  for (const h of held) {
    const released = await prisma.$transaction(async (tx) => {
      const r = await releaseHold(tx, h);
      await tx.paymentIntent.update({ where: { id: h.id }, data: { holdUntil: null } });
      return !r.duplicate;
    });
    if (released) {
      result.holdsReleased++;
      await notify(h.userId, "deposit_approved", { amount: h.amount, currency: h.currency }, "/account/wallet");
    }
  }

  const expired = await prisma.paymentIntent.updateMany({
    where: { provider: "MONCASH", status: "PENDING", createdAt: { lt: new Date(now.getTime() - 86_400_000) } },
    data: { status: "EXPIRED" },
  });
  result.expired = expired.count;

  const settings = await getSettings();
  if (settings.autoRefundHours > 0) {
    const cutoff = new Date(now.getTime() - settings.autoRefundHours * 3_600_000);
    const stuck = await prisma.order.findMany({
      where: {
        status: { in: ["PAID", "PROCESSING"] },
        paidAt: { lt: cutoff },
        items: { none: { status: "DELIVERED" } },
        riskFlags: { none: { status: "OPEN" } },
        NOT: { items: { some: { supplierOrders: { some: { status: { in: OPEN } } } } } },
      },
      select: { id: true },
      take: 50,
    });
    for (const o of stuck) {
      try {
        await refundOrCancel(o.id, null, `Not delivered within ${settings.autoRefundHours} hours: refunded automatically`);
        result.autoRefunded++;
      } catch (e) {
        console.error("Auto-refund failed", o.id, e);
      }
    }
  }
  return NextResponse.json(result);
}
