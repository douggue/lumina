import Link from "next/link";
import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { PageTitle, Table } from "@/components/admin/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { Avatar } from "@/components/Avatar";

export const metadata = { title: "Orders" };
const STATUSES: OrderStatus[] = ["AWAITING_PAYMENT", "PAYMENT_REVIEW", "PAID", "PROCESSING", "FULFILLED", "FAILED", "CANCELED", "REFUNDED"];

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireStaff("orders.view");
  const sp = await searchParams;
  const where: Prisma.OrderWhereInput = {};
  if (sp.status && STATUSES.includes(sp.status as OrderStatus)) where.status = sp.status as OrderStatus;
  if (sp.q) {
    const n = Number(sp.q.replace("#", ""));
    where.OR = [{ user: { email: { contains: sp.q, mode: "insensitive" } } }, ...(Number.isInteger(n) && n > 0 ? [{ number: n }] : [])];
  }
  const orders = await prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { name: true, email: true, image: true } }, _count: { select: { items: true } } } });
  return (
    <>
      <PageTitle title="Orders" />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Order # or email" className="input max-w-xs" />
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-[220px]">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn-primary">Filter</button>
      </form>
      <Table head={["Order", "Customer", "Items", "Total", "Method", "Status", "Date"]} empty={orders.length === 0}>
        {orders.map((o) => (
          <tr key={o.id} className="hover:bg-surface-2">
            <td className="px-4 py-3 font-semibold"><Link href={`/admin/orders/${o.id}`} className="text-primary">#{o.number}</Link></td>
            <td className="px-4 py-3"><span className="flex items-center gap-2"><Avatar name={o.user.name} image={o.user.image} size={28} /><span>{o.user.name}<br /><span className="text-xs text-muted">{o.user.email}</span></span></span></td>
            <td className="px-4 py-3">{o._count.items}</td>
            <td className="px-4 py-3">{formatMoney(o.total, o.currency, "en")}</td>
            <td className="px-4 py-3">{o.paymentMethod}</td>
            <td className="px-4 py-3"><StatusBadge status={o.status} label={o.status} /></td>
            <td className="px-4 py-3 text-muted">{o.createdAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
