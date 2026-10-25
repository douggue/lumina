import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { resolveRisk } from "@/actions/admin";
import { ActionButton } from "@/components/admin/ActionButton";
import { PageTitle, Table } from "@/components/admin/ui";

export const metadata = { title: "Risk queue" };

export default async function RiskPage() {
  await requireStaff("risk.manage");
  const flags = await prisma.riskFlag.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, name: true, email: true } }, order: { select: { id: true, number: true } } },
  });
  return (
    <>
      <PageTitle title="Risk queue" sub="High-value orders wait here before codes are released. Approving releases them; rejecting refunds the order to the wallet." />
      <Table head={["Reason", "Customer", "Order", "Created", ""]} empty={flags.length === 0}>
        {flags.map((f) => (
          <tr key={f.id}>
            <td className="px-4 py-3 font-medium">{f.reason}</td>
            <td className="px-4 py-3">{f.user ? <Link href={`/admin/customers/${f.user.id}`} className="text-primary">{f.user.name}</Link> : "—"}</td>
            <td className="px-4 py-3">{f.order ? <Link href={`/admin/orders/${f.order.id}`} className="text-primary">#{f.order.number}</Link> : "—"}</td>
            <td className="px-4 py-3 text-muted">{f.createdAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</td>
            <td className="px-4 py-3">
              <div className="flex gap-2">
                <ActionButton label="Approve" className="btn-primary min-h-9 px-3 text-xs" action={resolveRisk.bind(null, f.id, "APPROVED")} />
                <ActionButton label="Reject" className="btn-danger min-h-9 px-3 text-xs" confirm="Reject and refund/cancel the linked order?" action={resolveRisk.bind(null, f.id, "REJECTED")} />
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
