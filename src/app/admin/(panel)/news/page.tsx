import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { t } from "@/lib/text";
import { PageTitle, Table } from "@/components/admin/ui";

export const metadata = { title: "News" };

export default async function NewsAdmin() {
  await requireStaff("content.manage");
  const articles = await prisma.newsArticle.findMany({ orderBy: [{ publishedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }] });
  const now = new Date();
  return (
    <>
      <PageTitle title="News" sub="Articles appear on /news and in the homepage's latest-news section. A future publish date schedules the article." actions={<Link href="/admin/news/new" className="btn-primary">New article</Link>} />
      <Table head={["Title", "Status", "Publish date"]} empty={articles.length === 0}>
        {articles.map((a) => (
          <tr key={a.id} className="hover:bg-surface-2">
            <td className="px-4 py-3"><Link href={`/admin/news/${a.id}`} className="font-semibold text-primary">{t(a.title, "en") || t(a.title, "ht")}</Link><br /><span className="text-xs text-muted">/news/{a.slug}</span></td>
            <td className="px-4 py-3 text-xs">{!a.isPublished ? "Draft" : a.publishedAt && a.publishedAt > now ? "Scheduled" : "Published"}</td>
            <td className="px-4 py-3 text-muted">{a.publishedAt?.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) ?? "—"}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
