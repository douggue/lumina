import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { t } from "@/lib/text";
import { PageEditor } from "@/components/admin/PageEditor";
import { PageTitle } from "@/components/admin/ui";

export const metadata = { title: "Edit page" };

export default async function PageEdit({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("content.manage");
  const { id } = await params;
  const categories = (await prisma.category.findMany({ orderBy: { sortOrder: "asc" } })).map((c) => ({ slug: c.slug, name: t(c.name, "en") }));
  if (id === "new") return (<><PageTitle title="New page" /><PageEditor categories={categories} /></>);
  const p = await prisma.page.findUnique({ where: { id } });
  if (!p) notFound();
  return (
    <>
      <PageTitle title="Edit page" actions={p.isPublished ? <a href={`/ht/p/${p.slug}`} target="_blank" className="btn-secondary">View ↗</a> : undefined} />
      <PageEditor categories={categories} page={{ id: p.id, slug: p.slug, title: p.title as Record<string, string>, description: p.description as Record<string, string>, blocks: p.blocks as never, isPublished: p.isPublished, showInFooter: p.showInFooter }} />
    </>
  );
}
