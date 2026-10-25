import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getBalances } from "@/lib/ledger";
import { formatMoney } from "@/lib/money";
import { randomToken } from "@/lib/crypto";
import { adjustCustomerWallet, createPasswordResetLink, setCustomerStatus } from "@/actions/admin";
import { ResetLinkButton } from "@/components/admin/ResetLinkButton";
import { ActionButton, ActionForm } from "@/components/admin/ActionButton";
import { PageTitle, Stat } from "@/components/admin/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { linkedAccounts } from "@/lib/devices";
import { formatPhone } from "@/lib/phone";
import { Avatar } from "@/components/Avatar";

export const metadata = { title: "Customer" };

export default async function Customer({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("customers.view");
  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) notFound();
  const [balances, orders, payments, entries, flags, linked, devices] = await Promise.all([
    getBalances(prisma, id),
    prisma.order.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.paymentIntent.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    can(staff, "wallet.view") ? prisma.ledgerEntry.findMany({ where: { account: { userId: id } }, orderBy: { createdAt: "desc" }, take: 30, include: { transaction: true } }) : Promise.resolve([]),
    prisma.riskFlag.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 10 }),
    linkedAccounts(id),
    prisma.deviceSeen.findMany({ where: { userId: id }, orderBy: { lastSeen: "desc" }, take: 10 }),
  ]);
  return (
    <>
      <div className="mb-3"><Avatar name={user.name} image={user.image} size={56} /></div>
      <PageTitle title={user.name} sub={`${user.email}${user.phone ? ` · ${formatPhone(user.phone)}` : ""} · joined ${user.createdAt.toLocaleDateString("en-US")} · ${user.locale.toUpperCase()}`} actions={<span className="badge bg-surface-2">{user.status}</span>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="HTG available" value={formatMoney(balances.HTG.available, "HTG", "en")} />
        <Stat label="HTG held" value={formatMoney(balances.HTG.held, "HTG", "en")} />
        <Stat label="USD available" value={formatMoney(balances.USD.available, "USD", "en")} />
        <Stat label="Orders" value={orders.length} />
      </div>
      {can(staff, "customers.manage") && user.id !== staff.id && (
        <div className="mt-4 flex flex-wrap gap-2">
          {user.status !== "ACTIVE" && <ActionButton label="Set active" action={setCustomerStatus.bind(null, id, "ACTIVE")} />}
          {user.status !== "RESTRICTED" && <ActionButton label="Restrict (no orders)" action={setCustomerStatus.bind(null, id, "RESTRICTED")} />}
          {user.status !== "SUSPENDED" && <ActionButton label="Suspend & sign out" className="btn-danger min-h-9 px-3 text-xs" confirm="Suspend this account?" action={setCustomerStatus.bind(null, id, "SUSPENDED")} />}
        </div>
      )}
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Orders</h2>
          <ul className="divide-y divide-border text-sm">
            {orders.map((o) => <li key={o.id} className="flex justify-between py-2"><Link href={`/admin/orders/${o.id}`} className="text-primary">#{o.number}</Link><span>{formatMoney(o.total, o.currency, "en")} · <StatusBadge status={o.status} label={o.status} /></span></li>)}
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Payments</h2>
          <ul className="divide-y divide-border text-sm">
            {payments.map((p) => <li key={p.id} className="flex justify-between py-2"><span>{p.provider} {p.providerRef && <span className="font-mono text-xs">{p.providerRef}</span>}</span><span>{formatMoney(p.amount, p.currency, "en")} · <StatusBadge status={p.status} label={p.status} /></span></li>)}
          </ul>
        </section>
        {can(staff, "wallet.adjust") && (
          <ActionForm action={adjustCustomerWallet} className="card space-y-3 p-5" resetOnSuccess>
            <h2 className="font-semibold">Wallet adjustment</h2>
            <p className="text-xs text-muted">Creates a balanced ledger entry against the adjustment account. Logged with your name.</p>
            <input type="hidden" name="userId" value={id} />
            <input type="hidden" name="idempotencyKey" value={randomToken(16)} />
            <div className="grid grid-cols-3 gap-2">
              <select name="direction" className="input"><option value="credit">Credit +</option><option value="debit">Debit −</option></select>
              <select name="currency" className="input"><option>HTG</option><option>USD</option></select>
              <input name="amount" placeholder="Amount" inputMode="decimal" className="input" required />
            </div>
            <input name="reason" placeholder="Reason (required)" className="input" required minLength={5} />
            <button className="btn-primary min-h-9 px-4 text-xs">Post adjustment</button>
          </ActionForm>
        )}
        {can(staff, "customers.manage") && user.id !== staff.id && <ResetLinkButton action={createPasswordResetLink.bind(null, id)} />}
        {entries.length > 0 && (
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Ledger</h2>
            <ul className="divide-y divide-border text-sm">
              {entries.map((e) => <li key={e.id} className="flex justify-between gap-3 py-2"><span className="truncate">{e.transaction.type} · {e.transaction.description}</span><span className={e.amount > 0 ? "text-success" : ""}>{e.amount > 0 ? "+" : "−"}{formatMoney(Math.abs(e.amount), e.currency, "en")}</span></li>)}
            </ul>
          </section>
        )}
        <section className="card p-5">
          <h2 className="mb-1 font-semibold">Accounts sharing a browser or IP</h2>
          <p className="mb-3 text-xs text-muted">Same browser is a strong sign of one person with several accounts. Same IP alone is weak (families, cybercafés, mobile networks).</p>
          {linked.length === 0 ? (
            <p className="text-sm text-muted">None seen.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {linked.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/admin/customers/${u.id}`} className="min-w-0 truncate text-primary">{u.name} · {u.email}</Link>
                  <span className="flex gap-1">
                    {u.sameDevice && <span className="badge bg-danger-soft text-danger">same browser</span>}
                    {u.sameIp && <span className="badge bg-warning-soft text-warning">same IP</span>}
                    {u.status !== "ACTIVE" && <span className="badge bg-surface-2">{u.status}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {devices.length > 0 && (
            <details className="mt-3 text-xs text-muted">
              <summary className="cursor-pointer">Sign-in devices ({devices.length})</summary>
              <ul className="mt-2 space-y-1">{devices.map((d) => <li key={d.id} className="break-all">{d.lastSeen.toLocaleString("en-US")} · {d.ip ?? "?"} · {d.userAgent ?? "unknown browser"}</li>)}</ul>
            </details>
          )}
        </section>
        {flags.length > 0 && (
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Risk flags</h2>
            <ul className="space-y-1 text-sm">{flags.map((f) => <li key={f.id}>{f.status} · {f.reason}</li>)}</ul>
          </section>
        )}
      </div>
    </>
  );
}
