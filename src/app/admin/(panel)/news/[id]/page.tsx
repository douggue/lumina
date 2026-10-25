import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { NewsForm } from "@/components/admin/NewsForm";
import { PageTitle } from "@/components/admin/ui";

export const metadata = { title: "Article" };

export default async function NewsEdit({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("content.manage");
  const { id } = await params;
  if (id === "new") return (<><PageTitle title="New article" /><NewsForm /></>);
  const a = await prisma.newsArticle.findUnique({ where: { id } });
  if (!a) notFound();
  return (
    <>
      <PageTitle title="Edit article" actions={a.isPublished ? <a href={`/ht/news/${a.slug}`} target="_blank" className="btn-secondary">View ↗</a> : undefined} />
      <NewsForm article={{ id: a.id, slug: a.slug, image: a.image, isPublished: a.isPublished, publishedAt: a.publishedAt?.toISOString().slice(0, 16) ?? "", title: a.title as Record<string, string>, excerpt: a.excerpt as Record<string, string>, body: a.body as Record<string, string> }} />
    </>
  );
}
