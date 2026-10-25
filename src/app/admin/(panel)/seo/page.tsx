import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { deleteRedirect, savePageSeo, saveRedirect } from "@/actions/content";
import { ActionButton, ActionForm } from "@/components/admin/ActionButton";
import { LocalizedInputs } from "@/components/admin/LocalizedInputs";
import { PageTitle, Table } from "@/components/admin/ui";

export const metadata = { title: "SEO" };

const PAGES = [
  ["/", "Homepage"], ["/store", "Store"], ["/categories", "Categories"], ["/news", "News"], ["/guides", "Payment guides"],
  ["/faq", "FAQ"], ["/about", "About"], ["/contact", "Contact"], ["/terms", "Terms"], ["/privacy", "Privacy"], ["/refunds", "Refunds"],
] as const;

export default async function SeoPage() {
  await requireStaff("seo.manage");
  const [redirects, overrides] = await Promise.all([
    prisma.redirectRule.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.pageSeo.findMany(),
  ]);
  const byPath = Object.fromEntries(overrides.map((o) => [o.path, o]));
  return (
    <>
      <PageTitle title="SEO" sub="Product, category and news SEO fields are on their own edit pages. Here: titles for fixed pages and redirects for old links." />
      <h2 className="mb-3 font-semibold">Redirects</h2>
      <ActionForm action={saveRedirect} className="card mb-4 flex flex-wrap items-end gap-3 p-4" resetOnSuccess>
        <label className="flex-1"><span className="label">Old path</span><input name="from" required placeholder="/old-free-fire-page" className="input" /></label>
        <label className="flex-1"><span className="label">New path or URL</span><input name="to" required placeholder="/products/free-fire-diamonds" className="input" /></label>
        <label className="flex items-center gap-2 pb-3 text-sm"><input type="checkbox" name="permanent" defaultChecked /> Permanent (301)</label>
        <button className="btn-primary">Add redirect</button>
      </ActionForm>
      <Table head={["From", "To", "Type", "Used", ""]} empty={redirects.length === 0}>
        {redirects.map((r) => (
          <tr key={r.id}>
            <td className="px-4 py-2.5 font-mono text-xs">{r.from}</td>
            <td className="px-4 py-2.5 font-mono text-xs">{r.to}</td>
            <td className="px-4 py-2.5 text-xs">{r.permanent ? "301" : "302"}</td>
            <td className="px-4 py-2.5">{r.hits}</td>
            <td className="px-4 py-2.5"><ActionButton label="Delete" className="btn-ghost min-h-8 px-2 text-xs text-danger" action={deleteRedirect.bind(null, r.id)} /></td>
          </tr>
        ))}
      </Table>
      <p className="mt-2 text-xs text-muted">Redirects apply in every language: /ht/old-page, /fr/old-page… all go to the new page in the same language.</p>

      <h2 className="mb-3 mt-10 font-semibold">Page titles and descriptions</h2>
      <div className="space-y-3">
        {PAGES.map(([path, name]) => (
          <details key={path} className="card p-4">
            <summary className="cursor-pointer font-medium">{name} <span className="font-mono text-xs text-muted">{path}</span> {byPath[path] && <span className="badge ml-2 bg-primary-soft text-primary">Custom</span>}</summary>
            <ActionForm action={savePageSeo} className="mt-4 space-y-3">
              <input type="hidden" name="path" value={path} />
              <LocalizedInputs prefix="title" label="Title (about 60 characters; empty = default)" value={(byPath[path]?.title ?? {}) as Record<string, string>} />
              <LocalizedInputs prefix="description" label="Description (about 155 characters)" value={(byPath[path]?.description ?? {}) as Record<string, string>} textarea />
              <button className="btn-secondary min-h-9 px-4 text-xs">Save</button>
            </ActionForm>
          </details>
        ))}
      </div>
    </>
  );
}
