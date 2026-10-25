import { siteUrl } from "@/lib/site-url";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/money";
import { itemTitle } from "@/lib/orders";
import { deliverItem, refundOrder, revealOrderCodes, runFulfillment } from "@/actions/admin";
import { ActionButton } from "@/components/admin/ActionButton";
import { RevealCodes } from "@/components/admin/RevealCodes";
import { StatusBadge } from "@/components/StatusBadge";
import { PageTitle } from "@/components/admin/ui";
import { formatPhone, waNumber } from "@/lib/phone";
import { Avatar } from "@/components/Avatar";

export const metadata = { title: "Order" };


/** Readable names for what "customer enters the amount" products store on the item. */
const AMOUNT_LABELS: Record<string, string> = { amountUsd: "Amount to send (USD)", feeUsd: "Fee charged (USD)", rate: "Rate used (HTG per USD)" };
export default async function AdminOrder({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("orders.view");
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      user: true,
      items: { include: { variant: { include: { product: true } }, _count: { select: { codes: true } }, supplierOrders: { orderBy: { createdAt: "asc" }, include: { supplier: { select: { id: true, name: true } } } } } },
      events: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "desc" } },
      riskFlags: true,
    },
  });
  if (!order) notFound();
  const manage = can(staff, "orders.manage");

  return (
    <>
      <PageTitle
        title={`Order #${order.number}`}
        sub={`${order.createdAt.toLocaleString("en-US")} · ${order.paymentMethod} · ${formatMoney(order.total, order.currency, "en")}`}
        actions={<StatusBadge status={order.status} label={order.status} />}
      />
      {order.riskFlags.filter((f) => f.status === "OPEN").map((f) => (
        <p key={f.id} className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">Risk flag: {f.reason} — <Link href="/admin/risk" className="underline">review</Link></p>
      ))}
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <section className="card divide-y divide-border">
            {order.items.map((i) => (
              <div key={i.id} className="space-y-2 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{itemTitle(i, "en")} × {i.quantity}</p>
                  <StatusBadge status={i.status} label={i.status} />
                </div>
                <p className="text-xs text-muted">{i.variant.product.fulfillmentType} · {formatMoney(i.unitPrice, order.currency, "en")} each · {i._count.codes} code(s) assigned</p>
                {Object.entries(i.fieldValues as Record<string, string>).map(([k, v]) => (
                  <p key={k} className="text-sm"><span className="text-muted">{AMOUNT_LABELS[k] ?? k}:</span> <span className="font-mono font-semibold">{v}</span></p>
                ))}
                {i.deliveryNote && <p className="rounded-lg bg-surface-2 p-3 text-sm">{i.deliveryNote}</p>}
                {i.supplierOrders.map((so) => (
                  <p key={so.id} className="rounded-lg bg-surface-2 p-3 text-xs">
                    Supplier <Link href={`/admin/suppliers/${so.supplier.id}`} className="font-semibold text-primary">{so.supplier.name}</Link> · <code>{so.ref}</code> ·{" "}
                    <b className={so.status === "FAILED" ? "text-danger" : so.status === "SUCCESS" ? "text-success" : ""}>{so.status}</b>
                    {so.message && <span className="text-muted"> · {so.message}</span>}
                  </p>
                ))}
                {manage && i.status === "PENDING" && ["PAID", "PROCESSING"].includes(order.status) && (
                  <ActionButton label="Mark delivered…" className="btn-primary min-h-9 px-3 text-xs" prompt="Delivery note shown to the customer (e.g. 'Diamonds sent to ID 12345')" action={deliverItem.bind(null, i.id)} />
                )}
              </div>
            ))}
          </section>
          {manage && (
            <div className="flex flex-wrap gap-2">
              {["PAID", "PROCESSING"].includes(order.status) && <ActionButton label="Run automatic fulfillment" action={runFulfillment.bind(null, order.id)} />}
              {["AWAITING_PAYMENT", "PAYMENT_REVIEW", "PAID", "PROCESSING", "FAILED"].includes(order.status) && (
                <ActionButton label="Cancel / refund to wallet…" className="btn-danger min-h-9 px-3 text-xs" prompt="Reason (visible in the order history)" confirm="Refund this order to the customer's wallet?" action={refundOrder.bind(null, order.id)} />
              )}
            </div>
          )}
          {can(staff, "codes.reveal") && order.items.some((i) => i._count.codes > 0) && <RevealCodes action={revealOrderCodes.bind(null, order.id)} />}
        </div>
        <div className="space-y-4">
          <section className="card p-5 text-sm">
            <h2 className="mb-2 font-semibold">Customer</h2>
            <Link href={`/admin/customers/${order.userId}`} className="inline-flex items-center gap-2 font-medium text-primary"><Avatar name={order.user.name} image={order.user.image} size={28} />{order.user.name}</Link>
            <p className="text-muted">{order.user.email} {order.user.phone && <>· <a href={`https://wa.me/${waNumber(order.user.phone)}`} target="_blank" rel="noopener" className="text-[#1fa855]">{formatPhone(order.user.phone)} ↗</a></>}</p>
            {order.recipientNote && <p className="mt-2"><span className="text-muted">Note:</span> {order.recipientNote}</p>}
            <p className="mt-2 break-all text-xs"><span className="text-muted">Tracking link:</span> {`${siteUrl()}/${order.user.locale}/order-status/${order.id}?t=${order.accessToken}`}</p>
          </section>
          <section className="card p-5 text-sm">
            <h2 className="mb-2 font-semibold">Payments</h2>
            {order.payments.length === 0 ? <p className="text-muted">{order.paymentMethod === "WALLET" ? "Paid from wallet" : "No payment yet"}</p> : order.payments.map((p) => (
              <p key={p.id} className="py-1">{p.provider} · {formatMoney(p.amount, p.currency, "en")} · <b>{p.status}</b> {p.providerRef && `· ${p.providerRef}`}</p>
            ))}
          </section>
          <section className="card p-5 text-sm">
            <h2 className="mb-2 font-semibold">History</h2>
            <ol className="space-y-2">
              {order.events.map((e) => (
                <li key={e.id}><b>{e.status}</b> <span className="text-muted">{e.createdAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</span>{e.note && <><br /><span className="text-muted">{e.note}</span></>}</li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
