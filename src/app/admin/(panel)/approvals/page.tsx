import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { decideApproval } from "@/actions/admin";
import { ActionButton } from "@/components/admin/ActionButton";
import { PageTitle, Table } from "@/components/admin/ui";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const staff = await requireStaff("approvals.decide");
  const [pending, recent] = await Promise.all([
    prisma.pendingApproval.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    prisma.pendingApproval.findMany({ where: { status: { not: "PENDING" } }, orderBy: { decidedAt: "desc" }, take: 30 }),
  ]);
  const ids = [...new Set([...pending, ...recent].flatMap((a) => [a.requestedBy, a.decidedBy]).filter(Boolean) as string[])];
  const names = Object.fromEntries((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <>
      <PageTitle title="Approvals" sub="Large wallet adjustments need a second staff member. You can't approve your own request." />
      <Table head={["Request", "Requested by", "When", ""]} empty={pending.length === 0}>
        {pending.map((a) => (
          <tr key={a.id}>
            <td className="px-4 py-3 font-medium">{a.summary}</td>
            <td className="px-4 py-3">{names[a.requestedBy] ?? "—"}</td>
            <td className="px-4 py-3 text-muted">{a.createdAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</td>
            <td className="px-4 py-3">
              {a.requestedBy === staff.id ? (
                <span className="text-xs text-muted">Waiting for someone else</span>
              ) : (
                <div className="flex gap-2">
                  <ActionButton label="Approve" className="btn-primary min-h-9 px-3 text-xs" confirm={`Approve: ${a.summary}?`} action={decideApproval.bind(null, a.id, "APPROVED")} />
                  <ActionButton label="Reject" className="btn-danger min-h-9 px-3 text-xs" action={decideApproval.bind(null, a.id, "REJECTED")} />
                </div>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <h2 className="mb-3 mt-8 font-semibold">Decided</h2>
      <Table head={["Request", "Requested by", "Decision", "By"]} empty={recent.length === 0}>
        {recent.map((a) => (
          <tr key={a.id}>
            <td className="px-4 py-3">{a.summary}</td>
            <td className="px-4 py-3">{names[a.requestedBy] ?? "—"}</td>
            <td className="px-4 py-3 text-xs font-semibold">{a.status}</td>
            <td className="px-4 py-3">{a.decidedBy ? names[a.decidedBy] : "—"}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
