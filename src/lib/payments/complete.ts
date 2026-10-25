import { prisma } from "../db";
import { getSettings } from "../settings";
import { creditPayment, chargeOrder } from "../wallet";
import { usdToHtg } from "../money";
import { addEvent, fulfillOrder } from "../orders";
import { notify } from "../notify";
import { InsufficientFundsError } from "../ledger";

/**
 * Mark an external payment as succeeded exactly once and credit the wallet.
 * When the intent belongs to an order, the order is charged from the wallet in the same transaction.
 * Safe to call repeatedly (callbacks, return URL, polling, staff approval all converge here).
 */
export async function completePayment(
  intentId: string,
  opts: { providerRef?: string; verifiedAmount?: number; actorId?: string | null; note?: string },
) {
  const settings = await getSettings();

  const out = await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PaymentIntent" WHERE id = ${intentId} FOR UPDATE`;
    if (!locked) throw new Error("Payment not found");
    const intent = await tx.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
    if (intent.status === "SUCCEEDED") return { already: true, intent, held: false };
    if (!["PENDING", "REVIEW"].includes(intent.status)) throw new Error(`Payment is ${intent.status}`);
    if (opts.verifiedAmount !== undefined && opts.verifiedAmount !== intent.amount) {
      await tx.riskFlag.create({
        data: { reason: `Amount mismatch: expected ${intent.amount}, provider reported ${opts.verifiedAmount}`, userId: intent.userId, paymentIntentId: intent.id },
      });
      throw new Error("Amount mismatch");
    }

    // Large manual top-ups are held before they can be spent (blueprint §8). Order payments are not held;
    // high-value orders are reviewed through the order risk flag instead.
    const amountHtg = intent.currency === "USD" ? usdToHtg(intent.amount, settings.htgPerUsd) : intent.amount;
    const hold = !intent.orderId && intent.provider !== "MONCASH" && amountHtg >= settings.holdThresholdHtg;
    const updated = await tx.paymentIntent.update({
      where: { id: intent.id },
      data: {
        status: "SUCCEEDED",
        providerRef: opts.providerRef ?? intent.providerRef,
        reviewedById: opts.actorId ?? intent.reviewedById,
        reviewNote: opts.note ?? intent.reviewNote,
        holdUntil: hold ? new Date(Date.now() + settings.holdHours * 3_600_000) : null,
      },
    });
    await creditPayment(tx, updated, { hold, actorId: opts.actorId });

    if (intent.orderId) {
      const order = await tx.order.findUniqueOrThrow({ where: { id: intent.orderId } });
      if (["AWAITING_PAYMENT", "PAYMENT_REVIEW"].includes(order.status)) {
        try {
          await chargeOrder(tx, order);
          await tx.order.update({ where: { id: order.id }, data: { status: "PAID", paidAt: new Date() } });
          await addEvent(tx, order.id, "PAID", `${intent.provider} ${updated.providerRef ?? ""}`.trim(), opts.actorId);
        } catch (e) {
          if (!(e instanceof InsufficientFundsError)) throw e;
          // Cannot happen when amounts match, but never lose the money: it stays in the wallet.
        }
      }
    }
    return { already: false, intent: updated, held: hold };
  });

  if (!out.already) {
    const i = out.intent;
    if (i.orderId) {
      const o = await prisma.order.findUniqueOrThrow({ where: { id: i.orderId } });
      await notify(i.userId, "order_paid", { number: o.number }, `/account/orders/${o.id}`);
      await fulfillOrder(i.orderId);
    } else {
      await notify(i.userId, out.held ? "deposit_held" : "deposit_approved", { amount: i.amount, currency: i.currency }, "/account/wallet");
    }
  }
  return out;
}

export async function rejectPayment(intentId: string, actorId: string, note: string) {
  const intent = await prisma.$transaction(async (tx) => {
    const i = await tx.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
    if (!["PENDING", "REVIEW"].includes(i.status)) throw new Error(`Payment is ${i.status}`);
    const updated = await tx.paymentIntent.update({
      where: { id: intentId },
      data: { status: "REJECTED", reviewedById: actorId, reviewNote: note.slice(0, 500) },
    });
    if (i.orderId) {
      const order = await tx.order.findUniqueOrThrow({ where: { id: i.orderId } });
      if (order.status === "PAYMENT_REVIEW") {
        await tx.order.update({ where: { id: order.id }, data: { status: "AWAITING_PAYMENT" } });
        await addEvent(tx, order.id, "AWAITING_PAYMENT", `Payment rejected: ${note}`, actorId);
      }
    }
    return updated;
  });
  await notify(intent.userId, "deposit_rejected", { reason: note }, intent.orderId ? `/account/orders/${intent.orderId}` : "/account/wallet");
  return intent;
}
