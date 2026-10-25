import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { retrieveByTransaction } from "@/lib/payments/moncash";
import { verifyMoncashIntent } from "@/lib/payments/verify";

/** Customer lands here after MonCash. We verify server-side, then send them to their order or wallet. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const saved = req.cookies.get("NEXT_LOCALE")?.value;
  let locale = saved && ["ht", "fr"].includes(saved) ? saved : "ht";
  let ref = url.searchParams.get("ref") ?? url.searchParams.get("orderId");
  const transactionId = url.searchParams.get("transactionId");
  if (!ref && transactionId) ref = (await retrieveByTransaction(transactionId))?.reference ?? null;
  if (!ref) return NextResponse.redirect(new URL(`/${locale}/account`, url));

  try {
    await verifyMoncashIntent(ref);
  } catch (e) {
    console.error("MonCash verification failed", e);
  }
  const intent = await prisma.paymentIntent.findUnique({ where: { id: ref }, include: { user: { select: { locale: true } } } });
  // No language picked on this device: use the one the account was created in.
  if (!saved && intent?.user?.locale) locale = intent.user.locale;
  const dest = intent?.orderId ? `/${locale}/account/orders/${intent.orderId}` : `/${locale}/account/wallet`;
  return NextResponse.redirect(new URL(dest, url));
}
