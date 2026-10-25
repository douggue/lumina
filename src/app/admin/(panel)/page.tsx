import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { t } from "@/lib/text";
import { providerAlerts } from "@/lib/suppliers/catalog";
import { isSmm } from "@/lib/suppliers/smm-orders";
import { checkOrdersNow, syncProvidersAction } from "@/actions/catalog";
import { ActionButton } from "@/components/admin/ActionButton";

export const metadata = { title: "Dashboard" };

const g = (c: number) => `${c < 0 ? "−" : ""}${Math.abs(Math.round(c / 100)).toLocaleString("en-US")} HTG`;
const card = "rounded-[14px] border border-[#E5E7EF] bg-surface dark:border-border";
const pill = (bg: string, fg: string) => ({ background: bg, color: fg });
const B = {
  ok: pill("#DCFCE7", "#166534"),
  low: pill("#FEF3C7", "#92400E"),
  run: pill("#DBEAFE", "#1E40AF"),
  done: pill("#DCFCE7", "#166534"),
  stuck: pill("#FEE2E2", "#991B1B"),
  off: pill("#F1F5F9", "#475569"),
};
const TONE = { red: "bg-[#FEE2E2] text-[#7F1D1D]", amber: "bg-[#FEF3C7] text-[#78350F]", blue: "bg-[#DBEAFE] text-[#1E3A8A]" };
const btn = "inline-flex min-h-10 items-center rounded-[10px] border border-[#CBD2E1] bg-surface px-3.5 text-[13px] font-bold text-text dark:border-border";
const SOLD: OrderStatus[] = ["PAID", "PROCESSING", "FULFILLED"];

/** Admin dashboard (mockup "Admin dashboard"): today's sales, provider cost and real profit, providers, what needs attention, latest orders. */
export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const s = await getSettings();

  const [todays, topups, rewards, suppliers, linked, soToday, recent, reviews, risks, wallets, alerts] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: since }, currency: "HTG", status: { in: SOLD } },
      select: { total: true, items: { select: { supplierOrders: { select: { costHtg: true, refundedPartial: true, status: true } } } } },
    }),
    prisma.paymentIntent.groupBy({ by: ["provider"], where: { orderId: null, currency: "HTG", status: "SUCCEEDED", updatedAt: { gte: since } }, _sum: { amount: true } }),
    prisma.referral.aggregate({ where: { rewardedAt: { gte: since } }, _sum: { rewardAmount: true } }),
    prisma.supplier.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.productVariant.groupBy({ by: ["supplierId"], where: { isActive: true, supplierId: { not: null } }, _count: true }),
    prisma.supplierOrder.groupBy({ by: ["supplierId"], where: { createdAt: { gte: since } }, _count: true }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { name: true, email: true } }, items: { take: 1, include: { supplierOrders: { orderBy: { createdAt: "desc" } } } } },
    }),
    prisma.paymentIntent.count({ where: { status: "REVIEW" } }),
    prisma.riskFlag.count({ where: { status: "OPEN" } }),
    prisma.ledgerAccount.aggregate({ where: { currency: "HTG", type: { in: ["CUSTOMER_WALLET", "CUSTOMER_HELD"] } }, _sum: { balance: true } }),
    providerAlerts().catch(() => []),
  ]);

  // Sales = what customers paid today, less what went back to them for undelivered parts.
  const lines = todays.flatMap((o) => o.items.flatMap((i) => i.supplierOrders));
  const sales = todays.reduce((a, o) => a + o.total, 0) - lines.reduce((a, x) => a + (x.refundedPartial ?? 0), 0);
  const cost = lines.reduce((a, x) => a + (x.status === "FAILED" || x.status === "CLOSED" ? 0 : x.costHtg ?? 0), 0);
  const fees = Math.round((sales * s.paymentFeePct) / 100);
  const referral = rewards._sum.rewardAmount ?? 0;
  const profit = sales - cost - fees - referral;
  const topTotal = topups.reduce((a, x) => a + (x._sum.amount ?? 0), 0);
  const split = (["MONCASH", "NATCASH", "MANUAL"] as const)
    .map((p) => [p, topups.find((x) => x.provider === p)?._sum.amount ?? 0] as const)
    .filter(([, v]) => v > 0)
    .map(([p, v]) => `${p === "MONCASH" ? "MonCash" : p === "NATCASH" ? "NatCash" : "Bank"} ${Math.round((v / topTotal) * 100)}%`);

  const kpis = [
    { label: "Sales", value: g(sales), sub: `${todays.length} order${todays.length === 1 ? "" : "s"} today` },
    { label: "Provider cost", value: g(cost), sub: `$${(cost / 100 / s.htgPerUsd).toFixed(2)} at ${s.htgPerUsd} HTG/$` },
    { label: "Real profit", value: g(profit), sub: `after referral, fees${sales ? ` · ${Math.round((profit / sales) * 100)}%` : ""}` },
    { label: "Wallet top-ups", value: g(topTotal), sub: split.join(" · ") || "none yet today" },
  ];

  const attention = [
    ...alerts,
    ...(reviews ? [{ title: `${reviews} payment${reviews > 1 ? "s" : ""} to review`, text: "NatCash and bank transfers waiting for a check.", href: "/admin/payments", tone: "amber" as const }] : []),
    ...(risks ? [{ title: `${risks} risk flag${risks > 1 ? "s" : ""}`, text: "Orders or top-ups held for a look.", href: "/admin/risk", tone: "red" as const }] : []),
  ];

  const statusOf = (o: (typeof recent)[number]) => {
    const so = o.items[0]?.supplierOrders[0];
    if (o.status === "REFUNDED" || o.status === "CANCELED") return { text: "Refunded", style: B.off };
    if (so?.refundedPartial) return { text: `Partial · ${g(so.refundedPartial)} refunded`, style: B.low };
    if (o.status === "FULFILLED") return { text: "Completed", style: B.done };
    if (so && (so.status === "UNKNOWN" || so.status === "FAILED" || (so.status === "PENDING" && !so.nextCheckAt))) return { text: "Stuck", style: B.stuck };
    if (o.status === "PAID" || o.status === "PROCESSING") return { text: "In progress", style: B.run };
    return { text: "Waiting for payment", style: B.off };
  };

  return (
    <div className="flex flex-col gap-[22px]">
      {sp.denied && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">Your role does not have access to that page.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Dashboard</h1>
          <p className="mt-1 text-[13px] text-muted">Today · {since.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton label="Check orders now" className={btn} action={checkOrdersNow} />
          <ActionButton label="Sync services" className={btn} action={syncProvidersAction.bind(null, null)} />
          <Link href="/admin/suppliers" className="inline-flex min-h-10 items-center rounded-[10px] bg-[#00209F] px-3.5 text-[13px] font-bold text-white">Add provider</Link>
        </div>
      </div>

      <section className="grid gap-3.5 grid-cols-2 lg:[grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        {kpis.map((k) => (
          <div key={k.label} className={`${card} flex flex-col gap-1.5 p-4`}>
            <span className="text-[13px] font-semibold text-muted">{k.label}</span>
            <span className={`text-[22px] font-extrabold tracking-[-0.4px] sm:text-[26px] tabular-nums ${k.label === "Real profit" && profit < 0 ? "text-danger" : ""}`}>{k.value}</span>
            <span className="text-xs text-muted">{k.sub}</span>
          </div>
        ))}
      </section>

      <section className="flex flex-wrap gap-4">
        <div className={`${card} flex min-w-0 flex-[2_1_420px] flex-col gap-3 p-[18px]`}>
          <h2 className="text-base font-bold">Providers</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  {["Provider", "Balance", "Services", "Orders today", "Status"].map((h) => <th key={h} className="px-1.5 py-2 font-bold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {suppliers.map((x) => {
                  const low = x.lowBalance != null && x.balance != null && Number(x.balance) < Number(x.lowBalance);
                  const st = !x.isEnabled ? ["Off", B.off] : low ? ["Low balance", B.low] : ["OK", B.ok];
                  return (
                    <tr key={x.id} className="border-t border-[#EEF0F5] dark:border-border">
                      <td className="px-1.5 py-3 font-bold"><Link href={`/admin/suppliers/${x.id}`} className="text-text hover:text-[#00209F]">{x.name}</Link></td>
                      <td className="px-1.5 py-3 tabular-nums">{x.balance != null ? `${x.balanceCurrency === "USD" || !x.balanceCurrency ? "$" : ""}${Number(x.balance).toFixed(2)}${x.balanceCurrency && x.balanceCurrency !== "USD" ? ` ${x.balanceCurrency}` : ""}` : "—"}</td>
                      <td className="px-1.5 py-3">{linked.find((l) => l.supplierId === x.id)?._count ?? 0} on sale{isSmm(x.preset) ? "" : " · codes"}</td>
                      <td className="px-1.5 py-3 tabular-nums">{soToday.find((l) => l.supplierId === x.id)?._count ?? 0}</td>
                      <td className="px-1.5 py-3"><span className="whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold" style={st[1] as React.CSSProperties}>{st[0] as string}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!suppliers.length && <p className="py-6 text-center text-sm text-muted">No provider yet. Press &quot;Add provider&quot;.</p>}
          </div>
        </div>

        <div className={`${card} flex min-w-0 flex-[1_1_280px] flex-col gap-2.5 p-[18px]`}>
          <h2 className="text-base font-bold">Needs attention</h2>
          {attention.map((a) => (
            <Link key={a.title} href={a.href} className={`flex flex-col gap-[3px] rounded-[10px] px-3 py-2.5 ${TONE[a.tone]}`}>
              <span className="text-[13px] font-bold">{a.title}</span>
              <span className="text-xs leading-[1.45]">{a.text}</span>
            </Link>
          ))}
          {!attention.length && <p className="rounded-[10px] bg-[#DCFCE7] px-3 py-2.5 text-[13px] font-bold text-[#166534]">All good. Nothing waiting for you.</p>}
          <p className="mt-auto pt-2 text-xs text-muted">Customers hold {g(wallets._sum.balance ?? 0)} in their wallets.</p>
        </div>
      </section>

      <section className={`${card} flex flex-col gap-3 p-[18px]`}>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">Latest orders</h2>
          <Link href="/admin/orders" className="text-[13px] font-bold text-[#00209F] dark:text-primary">All orders →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                {["#", "Customer", "Service", "Qty", "Price", "Cost", "Profit", "Status"].map((h) => <th key={h} className="px-1.5 py-2 font-bold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {recent.map((o) => {
                const item = o.items[0];
                const fv = (item?.fieldValues ?? {}) as Record<string, string>;
                const sos = item?.supplierOrders ?? [];
                const lineCost = sos.reduce((a, x) => a + (x.status === "FAILED" || x.status === "CLOSED" ? 0 : x.costHtg ?? 0), 0);
                const refunded = sos.reduce((a, x) => a + (x.refundedPartial ?? 0), 0);
                const known = sos.some((x) => x.costHtg != null);
                const lost = o.status === "REFUNDED" || o.status === "CANCELED" || !SOLD.includes(o.status);
                const st = statusOf(o);
                return (
                  <tr key={o.id} className="border-t border-[#EEF0F5] dark:border-border">
                    <td className="px-1.5 py-[11px] text-muted"><Link href={`/admin/orders/${o.id}`} className="text-muted hover:text-[#00209F]">{o.number}</Link></td>
                    <td className="px-1.5 py-[11px] font-semibold">{o.user.name || o.user.email.split("@")[0]}</td>
                    <td className="px-1.5 py-[11px]">{item ? t(item.productName, "fr") : "—"}</td>
                    <td className="px-1.5 py-[11px] tabular-nums">{fv.quantity ? Number(fv.quantity).toLocaleString("en-US") : item?.quantity ?? "—"}</td>
                    <td className="px-1.5 py-[11px] tabular-nums">{o.total === 0 ? "Free" : g(o.total)}</td>
                    <td className="px-1.5 py-[11px] tabular-nums text-muted">{known ? g(lineCost) : "—"}</td>
                    <td className="px-1.5 py-[11px] font-bold tabular-nums text-[#166534] dark:text-success">{known && !lost ? g(o.total - refunded - lineCost) : "—"}</td>
                    <td className="px-1.5 py-[11px]"><span className="whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold" style={st.style}>{st.text}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
