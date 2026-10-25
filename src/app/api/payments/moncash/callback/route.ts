import { NextResponse, type NextRequest } from "next/server";
import { retrieveByTransaction } from "@/lib/payments/moncash";
import { verifyMoncashIntent } from "@/lib/payments/verify";

/**
 * MonCash alert/notification URL. The payload is only used to find the transaction;
 * status and amount always come from MonCash's own API, so a forged callback cannot credit anything.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const transactionId = String(body.transactionId ?? body.transaction_id ?? "");
  let ref = String(body.reference ?? body.orderId ?? "");
  if (!ref && transactionId) ref = (await retrieveByTransaction(transactionId))?.reference ?? "";
  if (!ref) return NextResponse.json({ ok: false }, { status: 400 });
  const r = await verifyMoncashIntent(ref);
  return NextResponse.json({ ok: true, status: r.status });
}
