import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { t } from "@/lib/text";
import { PageTitle, Stat, Table } from "@/components/admin/ui";
import { SalesChart } from "@/components/admin/SalesChart";

export const metadata = { title: "Reports" };
const RANGES = [7, 30, 90] as const;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireStaff("analytics.view");
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days) as 7) ? Number(sp.days) : 30;
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));
  const settings = await getSettings();

  const [paidOrders, items, deposits, newCustomers] = await Promise.all([
    prisma.order.findMany({
      where: { paidAt: { gte: since }, status: { in: ["PAID", "PROCESSING", "FULFILLED"] } },
      select: { total: true, currency: true, paymentMethod: true, paidAt: true },
    }),
    prisma.orderItem.findMany({
      where: { order: { paidAt: { gte: since }, status: { in: ["PAID", "PROCESSING", "FULFILLED"] } } },
      select: { quantity: true, unitPrice: true, productName: true, order: { select: { currency: true } } },
    }),
    prisma.paymentIntent.groupBy({ by: ["provider"], where: { status: "SUCCEEDED", orderId: null, updatedAt: { gte: since } }, _sum: { amount: true }, _count: true }),
    prisma.user.count({ where: { createdAt: { gte: since }, role: "CUSTOMER" } }),
  ]);

  // Everything is shown in HTG; USD sales are converted at the current admin rate.
  const toHtg = (amount: number, cur: string) => (cur === "HTG" ? amount : Math.round(amount * settings.htgPerUsd));
  const revenue = paidOrders.reduce((s, o) => s + toHtg(o.total, o.currency), 0);
  const avg = paidOrders.length ? Math.round(revenue / paidOrders.length) : 0;

  const daily = Array.from({ length: days }, (_, i) => {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    return { date: d.toISOString().slice(0, 10), htg: 0, orders: 0 };
  });
  for (const o of paidOrders) {
    const key = new Date(o.paidAt!.getTime() - o.paidAt!.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    const row = daily.find((r) => r.date === key);
    if (row) {
      row.htg += toHtg(o.total, o.currency);
      row.orders++;
    }
  }

  const byProduct = new Map<string, { name: string; qty: number; htg: number }>();
  for (const i of items) {
    const name = t(i.productName, "en");
    const row = byProduct.get(name) ?? { name, qty: 0, htg: 0 };
    row.qty += i.quantity;
    row.htg += toHtg(i.unitPrice * i.quantity, i.order.currency);
    byProduct.set(name, row);
  }
  const top = [...byProduct.values()].sort((a, b) => b.htg - a.htg).slice(0, 10);

  const byMethod = ["MONCASH", "NATCASH", "WALLET"].map((m) => {
    const list = paidOrders.filter((o) => o.paymentMethod === m);
    return { method: m, orders: list.length, htg: list.reduce((s, o) => s + toHtg(o.total, o.currency), 0) };
  });

  const money = (n: number) => formatMoney(n, "HTG", "en");
  return (
    <>
      <PageTitle
        title="Reports"
        sub={`Paid orders in the last ${days} days. USD amounts are converted at today's rate (1 USD = ${settings.htgPerUsd} HTG).`}
        actions={
          <div className="flex flex-wrap gap-2">
            {RANGES.map((r) => (
              <Link key={r} href={`/admin/analytics?days=${r}`} className={`badge px-3 py-1.5 ${r === days ? "bg-primary text-white" : "border border-border bg-surface"}`}>{r} days</Link>
            ))}
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Sales" value={<span className="text-xl">{money(revenue)}</span>} />
        <Stat label="Paid orders" value={paidOrders.length} />
        <Stat label="Average order" value={<span className="text-xl">{money(avg)}</span>} />
        <Stat label="Wallet top-ups" value={<span className="text-xl">{money(deposits.reduce((s, d) => s + (d._sum.amount ?? 0), 0))}</span>} />
        <Stat label="New customers" value={newCustomers} />
      </div>

      <section className="card mt-6 p-5">
        <h2 className="font-semibold">Daily sales (HTG)</h2>
        <SalesChart rows={daily} />
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted">Show as table</summary>
          <table className="mt-2 w-full text-left text-xs">
            <thead><tr className="text-muted"><th className="py-1">Date</th><th>Orders</th><th>Sales</th></tr></thead>
            <tbody>{daily.map((r) => <tr key={r.date} className="border-t border-border"><td className="py-1">{r.date}</td><td>{r.orders}</td><td>{money(r.htg)}</td></tr>)}</tbody>
          </table>
        </details>
      </section>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <div>
          <h2 className="mb-3 font-semibold">Top products</h2>
          <Table head={["Product", "Units", "Sales"]} empty={top.length === 0}>
            {top.map((p) => <tr key={p.name}><td className="px-4 py-2.5">{p.name}</td><td className="px-4 py-2.5">{p.qty}</td><td className="px-4 py-2.5">{money(p.htg)}</td></tr>)}
          </Table>
        </div>
        <div>
          <h2 className="mb-3 font-semibold">Sales by payment method</h2>
          <Table head={["Method", "Orders", "Sales"]}>
            {byMethod.map((m) => <tr key={m.method}><td className="px-4 py-2.5">{m.method}</td><td className="px-4 py-2.5">{m.orders}</td><td className="px-4 py-2.5">{money(m.htg)}</td></tr>)}
          </Table>
          <h2 className="mb-3 mt-6 font-semibold">Export (CSV)</h2>
          <div className="flex flex-wrap gap-2">
            <a className="btn-secondary min-h-9 px-3 text-xs" href={`/api/admin/export?type=orders&days=${days}`}>Orders</a>
            <a className="btn-secondary min-h-9 px-3 text-xs" href={`/api/admin/export?type=payments&days=${days}`}>Payments</a>
            <a className="btn-secondary min-h-9 px-3 text-xs" href={`/api/admin/export?type=ledger&days=${days}`}>Ledger</a>
            <a className="btn-secondary min-h-9 px-3 text-xs" href={`/api/admin/export?type=customers&days=${days}`}>New customers</a>
          </div>
        </div>
      </div>
    </>
  );
}
