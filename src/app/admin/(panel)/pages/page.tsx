import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { t } from "@/lib/text";
import { PageTitle, Table } from "@/components/admin/ui";

export const metadata = { title: "Pages" };

export default async function PagesAdmin() {
  await requireStaff("content.manage");
  const pages = await prisma.page.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageTitle title="Pages" sub="Build extra pages (promotions, how-tos, about the team) from blocks. Published pages live at /p/your-slug in every language." actions={<Link href="/admin/pages/new" className="btn-primary">New page</Link>} />
      <Table head={["Title", "Address", "Status", "Footer link"]} empty={pages.length === 0}>
        {pages.map((p) => (
          <tr key={p.id} className="hover:bg-surface-2">
            <td className="px-4 py-3"><Link href={`/admin/pages/${p.id}`} className="font-semibold text-primary">{t(p.title, "en") || t(p.title, "ht")}</Link></td>
            <td className="px-4 py-3 font-mono text-xs">/p/{p.slug}</td>
            <td className="px-4 py-3 text-xs">{p.isPublished ? "Published" : "Draft"}</td>
            <td className="px-4 py-3 text-xs">{p.showInFooter ? "Yes" : "—"}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
