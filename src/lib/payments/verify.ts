import { prisma } from "../db";
import { completePayment } from "./complete";
import { moncashMode, retrieveByReference } from "./moncash";

/** Ask MonCash for the real status of an intent and settle it. Never trusts the browser. */
export async function verifyMoncashIntent(intentId: string) {
  const intent = await prisma.paymentIntent.findUnique({ where: { id: intentId } });
  if (!intent || intent.provider !== "MONCASH") return { status: "not_found" as const };
  if (intent.status === "SUCCEEDED") return { status: "succeeded" as const, intent };

  let mockApproved = false;
  if (moncashMode() === "mock") {
    mockApproved = (await prisma.auditEvent.count({ where: { action: "moncash.mock.approved", targetId: intent.id } })) > 0;
  }
  const payment = await retrieveByReference(intent.id, mockApproved, intent.amount);
  if (!payment || !payment.successful) return { status: "pending" as const, intent };

  await completePayment(intent.id, { providerRef: payment.transactionId, verifiedAmount: payment.amountHtgMinor });
  return { status: "succeeded" as const, intent };
}
