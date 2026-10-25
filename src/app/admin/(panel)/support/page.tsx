import Link from "next/link";
import type { TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { PageTitle, Table } from "@/components/admin/ui";

export const metadata = { title: "Support" };

export default async function SupportAdmin({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireStaff("support.manage");
  const sp = await searchParams;
  const status = (["OPEN", "WAITING_CUSTOMER", "CLOSED"].includes(sp.status ?? "") ? sp.status : "OPEN") as TicketStatus;
  const tickets = await prisma.supportTicket.findMany({ where: { status }, orderBy: { updatedAt: status === "OPEN" ? "asc" : "desc" }, take: 100, include: { user: { select: { name: true, email: true } }, _count: { select: { messages: true } } } });
  return (
    <>
      <PageTitle title="Support" sub="Oldest open requests first." actions={
        <div className="flex gap-2">
          {(["OPEN", "WAITING_CUSTOMER", "CLOSED"] as const).map((s) => (
            <Link key={s} href={`/admin/support?status=${s}`} className={`badge px-3 py-1.5 ${s === status ? "bg-primary text-white" : "border border-border bg-surface"}`}>{s.replace("_", " ")}</Link>
          ))}
        </div>
      } />
      <Table head={["Request", "Customer", "Messages", "Updated"]} empty={tickets.length === 0}>
        {tickets.map((t) => (
          <tr key={t.id} className="hover:bg-surface-2">
            <td className="px-4 py-3"><Link href={`/admin/support/${t.id}`} className="font-semibold text-primary">#{t.number} {t.subject}</Link></td>
            <td className="px-4 py-3">{t.user.name}<br /><span className="text-xs text-muted">{t.user.email}</span></td>
            <td className="px-4 py-3">{t._count.messages}</td>
            <td className="px-4 py-3 text-muted">{t.updatedAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
