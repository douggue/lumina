import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { formatMoney } from "@/lib/money";
import { t } from "@/lib/text";
import { saveCategory } from "@/actions/admin";
import { ActionForm } from "@/components/admin/ActionButton";
import { PageTitle, Table } from "@/components/admin/ui";
import { LocalizedInputs } from "@/components/admin/LocalizedInputs";
import { ImageField } from "@/components/admin/ImageField";

export const metadata = { title: "Products" };

export default async function AdminProducts() {
  await requireStaff("catalog.manage");
  const [products, categories] = await Promise.all([
    prisma.product.findMany({ orderBy: [{ sortOrder: "asc" }], include: { category: true, variants: true } }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { products: true } } } }),
  ]);
  return (
    <>
      <PageTitle title="Products" actions={<Link href="/admin/products/new" className="btn-primary">New product</Link>} />
      <Table head={["Product", "Category", "Fulfillment", "Variants", "From", "Status"]} empty={products.length === 0}>
        {products.map((p) => (
          <tr key={p.id} className="hover:bg-surface-2">
            <td className="px-4 py-3"><div className="flex items-center gap-3">{p.image ? <img src={p.image} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <span className="h-10 w-10 rounded-lg" style={{ background: p.accent ?? "#1467F5" }} />}<div><Link href={`/admin/products/${p.id}`} className="font-semibold text-primary">{t(p.name, "en")}</Link><br /><span className="text-xs text-muted">/{p.slug}</span></div></div></td>
            <td className="px-4 py-3">{t(p.category.name, "en")}</td>
            <td className="px-4 py-3 text-xs">{p.fulfillmentType}</td>
            <td className="px-4 py-3">{p.variants.length}</td>
            <td className="px-4 py-3">{p.variants.length ? formatMoney(Math.min(...p.variants.map((v) => v.salePriceHtg ?? v.priceHtg)), "HTG", "en") : "—"}</td>
            <td className="px-4 py-3">{p.isPublished ? <span className="badge bg-success-soft text-success">Published</span> : <span className="badge bg-surface-2 text-muted">Draft</span>}{p.isFeatured && <span className="badge ml-1 bg-primary-soft text-primary">Featured</span>}</td>
          </tr>
        ))}
      </Table>

      <h2 className="mb-3 mt-10 text-lg font-semibold">Categories</h2>
      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        {categories.map((c) => (
          <ActionForm key={c.id} action={saveCategory} className="card space-y-3 p-4">
            <input type="hidden" name="id" value={c.id} />
            <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] gap-2">
              <input name="slug" defaultValue={c.slug} className="input" aria-label="Slug" />
              <input name="icon" defaultValue={c.icon ?? ""} className="input" aria-label="Icon" />
              <input name="sortOrder" type="number" defaultValue={c.sortOrder} className="input" aria-label="Order" />
            </div>
            <LocalizedInputs prefix="name" label="Name" value={c.name as Record<string, string>} />
            <label className="block"><span className="label">Parent (makes this a subcategory)</span>
              <select name="parentId" defaultValue={c.parentId ?? ""} className="input">
                <option value="">None (top level)</option>
                {categories.filter((x) => !x.parentId && x.id !== c.id).map((x) => <option key={x.id} value={x.id}>{t(x.name, "en")}</option>)}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] [&>*]:min-w-0">
              <ImageField name="cover" label="Background image (big)" value={c.cover} folder="categories" aspect="aspect-[16/9]" hint="Wide picture filling the whole card, about 1200×700 px. Keep the left side calm: the name and icon sit there. Empty = colored background." />
              <ImageField name="image" label="Square icon (small)" value={c.image} folder="categories" aspect="aspect-square" hint="Replaces the emoji in the white tile." />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isVisible" defaultChecked={c.isVisible} /> Visible · {c._count.products} products</label>
              <button className="btn-secondary min-h-9 px-3 text-xs">Save</button>
            </div>
          </ActionForm>
        ))}
        <ActionForm action={saveCategory} className="card space-y-3 border-dashed p-4" resetOnSuccess>
          <p className="font-semibold">New category</p>
          <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] gap-2">
            <input name="slug" placeholder="slug" className="input" required />
            <input name="icon" placeholder="🎮" className="input" />
            <input name="sortOrder" type="number" defaultValue={10} className="input" />
          </div>
          <LocalizedInputs prefix="name" label="Name" />
          <label className="block"><span className="label">Parent (optional)</span>
            <select name="parentId" defaultValue="" className="input">
              <option value="">None (top level)</option>
              {categories.filter((x) => !x.parentId).map((x) => <option key={x.id} value={x.id}>{t(x.name, "en")}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] [&>*]:min-w-0">
            <ImageField name="cover" label="Background image (big)" folder="categories" aspect="aspect-[16/9]" hint="Wide picture filling the whole card, about 1200×700 px. Keep the left side calm: the name and icon sit there. Empty = colored background." />
            <ImageField name="image" label="Square icon (small)" folder="categories" aspect="aspect-square" />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isVisible" defaultChecked /> Visible</label>
          <button className="btn-primary min-h-9 px-3 text-xs">Create</button>
        </ActionForm>
      </div>
    </>
  );
}
