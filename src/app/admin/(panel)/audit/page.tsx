import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { PageTitle, Table } from "@/components/admin/ui";

export const metadata = { title: "Audit log" };

export default async function AuditPage() {
  await requireStaff("audit.view");
  const events = await prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { actor: { select: { name: true } } } });
  return (
    <>
      <PageTitle title="Audit log" sub="Last 200 sensitive actions." />
      <Table head={["When", "Who", "Action", "Target", "Details"]}>
        {events.map((e) => (
          <tr key={e.id}>
            <td className="px-4 py-2.5 text-muted">{e.createdAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "medium" })}</td>
            <td className="px-4 py-2.5">{e.actor?.name ?? "system"}</td>
            <td className="px-4 py-2.5 font-mono text-xs">{e.action}</td>
            <td className="px-4 py-2.5 text-xs">{e.targetType} {e.targetId?.slice(-8)}</td>
            <td className="max-w-xs truncate px-4 py-2.5 font-mono text-xs text-muted">{JSON.stringify(e.metadata)}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
