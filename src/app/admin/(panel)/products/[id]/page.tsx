import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { t } from "@/lib/text";
import { saveVariant, setProductSoldOut } from "@/actions/admin";
import { ActionForm } from "@/components/admin/ActionButton";
import { LocalizedInputs } from "@/components/admin/LocalizedInputs";
import { ProductForm } from "@/components/admin/ProductForm";
import { PageTitle } from "@/components/admin/ui";

export const metadata = { title: "Edit product" };

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("catalog.manage");
  const { id } = await params;
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  const cats = categories.map((c) => ({ id: c.id, name: t(c.name, "en") }));
  if (id === "new") {
    return (
      <>
        <PageTitle title="New product" />
        <ProductForm categories={cats} />
      </>
    );
  }
  const product = await prisma.product.findUnique({ where: { id }, include: { variants: { orderBy: { sortOrder: "asc" }, include: { _count: { select: { codes: { where: { status: "AVAILABLE" } } } } } } } });
  if (!product) notFound();
  const suppliers = product.fulfillmentType === "SUPPLIER_API" ? await prisma.supplier.findMany({ select: { id: true, name: true, isEnabled: true }, orderBy: { name: "asc" } }) : [];
  const supplierFields = (v?: { supplierId: string | null; supplierSku: string | null }) =>
    product.fulfillmentType !== "SUPPLIER_API" ? null : (
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="mb-1 block text-xs text-muted">Supplier</span>
          <select name="supplierId" defaultValue={v?.supplierId ?? ""} className="input">
            <option value="">— Deliver by hand —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.isEnabled ? "" : " (off)"}</option>)}
          </select>
        </label>
        <label><span className="mb-1 block text-xs text-muted">Supplier product code</span><input name="supplierSku" defaultValue={v?.supplierSku ?? ""} className="input font-mono" spellCheck={false} /></label>
      </div>
    );
  const money = (n: number | null) => (n == null ? "" : (n / 100).toFixed(2));
  return (
    <>
      <PageTitle title={t(product.name, "en")} sub={`/${product.slug}`} actions={<a href={`/ht/products/${product.slug}`} target="_blank" className="btn-secondary">View in store ↗</a>} />
      <ProductForm
        categories={cats}
        product={{
          id: product.id, slug: product.slug, categoryId: product.categoryId, accent: product.accent ?? "#1467F5",
          fulfillmentType: product.fulfillmentType, isPublished: product.isPublished, isFeatured: product.isFeatured, sortOrder: product.sortOrder,
          name: product.name as Record<string, string>, description: product.description as Record<string, string>,
          delivery: (product.deliveryEstimate ?? {}) as Record<string, string>, seoTitle: (product.seoTitle ?? {}) as Record<string, string>,
          seoDescription: (product.seoDescription ?? {}) as Record<string, string>, fields: JSON.stringify(product.fields, null, 2),
          image: product.image, gallery: (product.gallery ?? []) as string[], tags: product.tags,
        }}
      />
      <div className="mb-3 mt-10 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Variants (prices in HTG)</h2>
        <div className="flex flex-wrap gap-2">
          <ActionForm action={setProductSoldOut}>
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="soldOut" value="1" />
            <button className="btn-secondary min-h-9 px-3 text-xs text-danger">Mark all out of stock</button>
          </ActionForm>
          <ActionForm action={setProductSoldOut}>
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="soldOut" value="0" />
            <button className="btn-secondary min-h-9 px-3 text-xs">All back in stock</button>
          </ActionForm>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {product.variants.map((v) => (
          <ActionForm key={v.id} action={saveVariant} className="card space-y-3 p-4">
            <input type="hidden" name="id" value={v.id} />
            <input type="hidden" name="productId" value={product.id} />
            <LocalizedInputs prefix="vname" label="Name" value={v.name as Record<string, string>} />
            <div className="grid grid-cols-3 gap-2">
              <label><span className="mb-1 block text-xs text-muted">Price HTG</span><input name="price" defaultValue={money(v.priceHtg)} className="input" inputMode="decimal" /></label>
              <label><span className="mb-1 block text-xs text-muted">Sale price</span><input name="salePrice" defaultValue={money(v.salePriceHtg)} className="input" inputMode="decimal" /></label>
              <label><span className="mb-1 block text-xs text-muted">Order</span><input name="sortOrder" type="number" defaultValue={v.sortOrder} className="input" /></label>
            </div>
            {supplierFields(v)}
            <div className="flex items-center justify-between text-sm">
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <label className="flex items-center gap-2"><input type="checkbox" name="isActive" defaultChecked={v.isActive} /> Active</label>
                <label className={`flex items-center gap-2 ${v.soldOut ? "font-semibold text-danger" : ""}`}><input type="checkbox" name="soldOut" defaultChecked={v.soldOut} /> Out of stock</label>
              </span>
              {product.fulfillmentType === "CODE_INVENTORY" && <Link href={`/admin/codes?variant=${v.id}`} className="text-primary">{v._count.codes} codes in stock</Link>}
              <button className="btn-secondary min-h-9 px-3 text-xs">Save</button>
            </div>
          </ActionForm>
        ))}
        <ActionForm action={saveVariant} className="card space-y-3 border-dashed p-4" resetOnSuccess>
          <p className="font-semibold">New variant</p>
          <input type="hidden" name="productId" value={product.id} />
          <LocalizedInputs prefix="vname" label="Name" />
          <div className="grid grid-cols-3 gap-2">
            <input name="price" placeholder="Price HTG" className="input" inputMode="decimal" required />
            <input name="salePrice" placeholder="Sale (optional)" className="input" inputMode="decimal" />
            <input name="sortOrder" type="number" defaultValue={product.variants.length} className="input" />
          </div>
          {supplierFields()}
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="isActive" defaultChecked /> Active</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="soldOut" /> Out of stock</label>
          </div>
          <button className="btn-primary min-h-9 px-3 text-xs">Add variant</button>
        </ActionForm>
      </div>
    </>
  );
}
