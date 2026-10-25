import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUser } from "@/lib/session";
import { audit } from "@/lib/audit";

/** Customer data export (privacy). Delivered account codes are deliberately left out. */
export async function GET() {
  const u = await getUser();
  if (!u) return new NextResponse("Sign in first", { status: 401 });
  const [user, orders, payments, ledger, tickets, notifications, referrals] = await Promise.all([
    prisma.user.findUnique({ where: { id: u.id }, select: { id: true, name: true, email: true, phone: true, locale: true, displayCurrency: true, createdAt: true, notifyPrefs: true } }),
    prisma.order.findMany({ where: { userId: u.id }, include: { items: { select: { productName: true, variantName: true, quantity: true, unitPrice: true, fieldValues: true, status: true, deliveryNote: true } }, events: { select: { status: true, createdAt: true } } } }),
    prisma.paymentIntent.findMany({ where: { userId: u.id }, select: { provider: true, amount: true, currency: true, status: true, providerRef: true, createdAt: true } }),
    prisma.ledgerEntry.findMany({ where: { account: { userId: u.id } }, select: { amount: true, currency: true, createdAt: true, transaction: { select: { type: true, description: true } } } }),
    prisma.supportTicket.findMany({ where: { userId: u.id }, include: { messages: { select: { body: true, fromStaff: true, createdAt: true } } } }),
    prisma.notification.findMany({ where: { userId: u.id }, select: { type: true, params: true, createdAt: true } }),
    prisma.referral.findMany({ where: { referrerId: u.id }, select: { status: true, rewardAmount: true, createdAt: true } }),
  ]);
  await audit(u.id, "account.export", "User", u.id);
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), note: "Amounts are in minor units (centimes/cents).", user, orders, payments, wallet: ledger, supportTickets: tickets, notifications, referrals }, null, 2);
  return new NextResponse(body, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="haitiviral-my-data.json"`, "cache-control": "no-store" } });
}
