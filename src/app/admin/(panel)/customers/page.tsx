import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { PageTitle, Table } from "@/components/admin/ui";
import { Avatar } from "@/components/Avatar";

export const metadata = { title: "Customers" };

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff("customers.view");
  const { q } = await searchParams;
  const where: Prisma.UserWhereInput = q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {};
  const users = await prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { _count: { select: { orders: true } } } });
  return (
    <>
      <PageTitle title="Customers" />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={q} placeholder="Name, email or phone" className="input max-w-sm" /><button className="btn-primary">Search</button></form>
      <Table head={["Name", "Email", "Phone", "Role", "Status", "Orders", "Joined"]} empty={users.length === 0}>
        {users.map((u) => (
          <tr key={u.id} className="hover:bg-surface-2">
            <td className="px-4 py-3"><Link href={`/admin/customers/${u.id}`} className="inline-flex items-center gap-2 font-semibold text-primary"><Avatar name={u.name} image={u.image} size={28} />{u.name}</Link></td>
            <td className="px-4 py-3">{u.email}</td>
            <td className="px-4 py-3">{u.phone ?? "—"}</td>
            <td className="px-4 py-3 text-xs">{u.role}</td>
            <td className="px-4 py-3 text-xs">{u.status}</td>
            <td className="px-4 py-3">{u._count.orders}</td>
            <td className="px-4 py-3 text-muted">{u.createdAt.toLocaleDateString("en-US")}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
