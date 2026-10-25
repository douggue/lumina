import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { PageTitle, Table } from "@/components/admin/ui";

export const metadata = { title: "Ledger" };

export default async function LedgerPage() {
  await requireStaff("wallet.view");
  const [system, txs] = await Promise.all([
    prisma.ledgerAccount.findMany({ where: { userId: null }, orderBy: { code: "asc" } }),
    prisma.ledgerTransaction.findMany({ orderBy: { createdAt: "desc" }, take: 60, include: { entries: { include: { account: { select: { code: true } } } } } }),
  ]);
  const totals = await prisma.ledgerAccount.groupBy({ by: ["type", "currency"], where: { userId: { not: null } }, _sum: { balance: true } });
  return (
    <>
      <PageTitle title="Ledger" sub="Double-entry and append-only. Every transaction sums to zero per currency (enforced in the database)." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Table head={["System account", "Balance"]}>
          {system.map((a) => <tr key={a.id}><td className="px-4 py-2.5 font-mono text-xs">{a.code}</td><td className="px-4 py-2.5">{formatMoney(a.balance, a.currency, "en")}</td></tr>)}
        </Table>
        <Table head={["Customer balances", "Total"]}>
          {totals.map((t) => <tr key={`${t.type}${t.currency}`}><td className="px-4 py-2.5 text-xs">{t.type} {t.currency}</td><td className="px-4 py-2.5">{formatMoney(t._sum.balance ?? 0, t.currency, "en")}</td></tr>)}
        </Table>
      </div>
      <h2 className="mb-3 mt-8 font-semibold">Recent transactions</h2>
      <Table head={["Date", "Type", "Description", "Entries"]}>
        {txs.map((tx) => (
          <tr key={tx.id}>
            <td className="px-4 py-2.5 text-muted">{tx.createdAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</td>
            <td className="px-4 py-2.5 text-xs font-semibold">{tx.type}</td>
            <td className="px-4 py-2.5">{tx.description}</td>
            <td className="px-4 py-2.5 font-mono text-xs">{tx.entries.map((e) => <div key={e.id}>{e.account.code}: {e.amount > 0 ? "+" : ""}{(e.amount / 100).toFixed(2)}</div>)}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
