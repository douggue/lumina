import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assertStaff } from "@/lib/session";
import { audit } from "@/lib/audit";
import { t } from "@/lib/text";

/** CSV exports for accounting. Cells starting with = + - @ are prefixed so spreadsheets don't run them as formulas. */
function csv(rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\n");
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") ?? "orders";
  const days = Math.min(366, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 30)));
  let staff;
  try {
    staff = await assertStaff(type === "customers" ? "customers.view" : type === "ledger" ? "wallet.view" : type === "newsletter" ? "content.manage" : "analytics.view");
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const since = new Date(Date.now() - days * 86_400_000);
  const m = (n: number) => (n / 100).toFixed(2);
  let rows: (string | number | null)[][] = [];

  if (type === "orders") {
    const orders = await prisma.order.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, include: { user: { select: { email: true } }, items: true } });
    rows = [["number", "created_at", "paid_at", "status", "customer_email", "payment_method", "currency", "total", "items"]];
    for (const o of orders) rows.push([o.number, o.createdAt.toISOString(), o.paidAt?.toISOString() ?? "", o.status, o.user.email, o.paymentMethod, o.currency, m(o.total), o.items.map((i) => `${t(i.productName, "en")} - ${t(i.variantName, "en")} x${i.quantity}`).join("; ")]);
  } else if (type === "payments") {
    const list = await prisma.paymentIntent.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, include: { user: { select: { email: true } } } });
    rows = [["id", "created_at", "provider", "status", "customer_email", "currency", "amount", "reference", "order_id"]];
    for (const p of list) rows.push([p.id, p.createdAt.toISOString(), p.provider, p.status, p.user.email, p.currency, m(p.amount), p.providerRef, p.orderId]);
  } else if (type === "ledger") {
    const entries = await prisma.ledgerEntry.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, include: { account: { select: { code: true } }, transaction: true } });
    rows = [["transaction_id", "created_at", "type", "description", "account", "currency", "amount"]];
    for (const e of entries) rows.push([e.transactionId, e.createdAt.toISOString(), e.transaction.type, e.transaction.description, e.account.code, e.currency, m(e.amount)]);
  } else if (type === "customers") {
    const users = await prisma.user.findMany({ where: { createdAt: { gte: since }, role: "CUSTOMER" }, orderBy: { createdAt: "asc" }, include: { _count: { select: { orders: true } } } });
    rows = [["joined_at", "name", "email", "phone", "language", "status", "orders"]];
    for (const u of users) rows.push([u.createdAt.toISOString(), u.name, u.email, u.phone, u.locale, u.status, u._count.orders]);
  } else if (type === "newsletter") {
    const subs = await prisma.newsletterSubscriber.findMany({ where: { unsubscribedAt: null }, orderBy: { consentAt: "asc" } });
    rows = [["email", "language", "consent_at", "unsubscribe_token"]];
    for (const x of subs) rows.push([x.email, x.locale, x.consentAt.toISOString(), x.token]);
  } else {
    return new NextResponse("Unknown export", { status: 400 });
  }
  await audit(staff.id, "export.csv", "Export", type, { days, rows: rows.length - 1 });
  return new NextResponse(csv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="haitiviral-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
