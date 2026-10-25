import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { OPEN, checkSupplierOrder, finishOrders } from "@/lib/suppliers/orders";
import type { SupplierConfig } from "@/lib/suppliers/types";

/**
 * Supplier callback ("webhook"): the supplier says an order changed. The message itself is never trusted:
 * we look for one of our references in it and ask the supplier for the real status, the same as the cron does.
 */
async function handle(req: NextRequest, token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new NextResponse("not found", { status: 404 });
  const supplier = await prisma.supplier.findUnique({ where: { callbackToken: token }, select: { id: true, config: true } });
  if (!supplier) return new NextResponse("not found", { status: 404 });
  const body = (await req.text().catch(() => "")).slice(0, 100_000) + " " + req.nextUrl.search;
  const open = await prisma.supplierOrder.findMany({
    where: { supplierId: supplier.id, status: { in: OPEN.filter((s) => s !== "QUEUED" && s !== "SENDING") } },
    select: { id: true, ref: true, supplierOrderId: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const matched = open.filter((o) => body.includes(o.ref) || (o.supplierOrderId && body.includes(o.supplierOrderId)));
  // No reference we recognize: check the most recent open ones (bounded, and each check is rate-limited by its lock).
  const toCheck = (matched.length ? matched : open.slice(0, 5)).map((o) => o.id);
  const delivered: string[] = [];
  for (const id of toCheck) {
    const o = await checkSupplierOrder(id).catch(() => null);
    if (o) delivered.push(o);
  }
  await finishOrders(delivered);
  const reply = (supplier.config as unknown as SupplierConfig).callbackReply ?? "ok";
  return new NextResponse(reply, { status: 200, headers: { "Content-Type": reply.trim().startsWith("{") ? "application/json" : "text/plain" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return handle(req, (await params).token);
}
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return handle(req, (await params).token);
}
