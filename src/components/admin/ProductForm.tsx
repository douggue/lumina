"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveProduct } from "@/actions/admin";
import { LocalizedInputs } from "./LocalizedInputs";
import { GalleryField, ImageField } from "./ImageField";

type P = {
  id: string; slug: string; categoryId: string; accent: string; fulfillmentType: string; isPublished: boolean; isFeatured: boolean; sortOrder: number;
  name: Record<string, string>; description: Record<string, string>; delivery: Record<string, string>;
  seoTitle: Record<string, string>; seoDescription: Record<string, string>; fields: string; tags: string[];
  image: string | null; gallery: string[];
};

const FIELD_EXAMPLE = `[
  { "key": "playerId", "label": { "ht": "ID jwè", "fr": "ID joueur" }, "type": "number", "required": true }
]`;

export function ProductForm({ product, categories }: { product?: P; categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="card space-y-5 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await saveProduct(fd);
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          setMsg({ ok: true, text: "Saved" });
          if (!product && r.id) router.push(`/admin/products/${r.id}`);
          else router.refresh();
        });
      }}
    >
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label><span className="label">Slug (URL)</span><input name="slug" defaultValue={product?.slug} required className="input" placeholder="free-fire-diamonds" /></label>
        <label><span className="label">Category</span>
          <select name="categoryId" defaultValue={product?.categoryId} className="input">{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <label><span className="label">Fulfillment</span>
          <select name="fulfillmentType" defaultValue={product?.fulfillmentType ?? "MANUAL"} className="input">
            <option value="CODE_INVENTORY">Code inventory (instant)</option>
            <option value="MANUAL">Manual (staff delivers)</option>
            <option value="SUPPLIER_API">Supplier API (ordered from the supplier set on each option)</option>
          </select>
        </label>
        <label><span className="label">Tile color</span><input name="accent" type="color" defaultValue={product?.accent ?? "#1467F5"} className="input h-11 p-1" /></label>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <ImageField name="image" label="Main image" value={product?.image} folder="products" hint="JPG, PNG or WebP, up to 5 MB. Square or 4:3 works best. Without an image, a colored tile with the initials is shown." />
        <GalleryField name="gallery" label="Gallery (up to 8 extra photos)" value={product?.gallery} folder="products" />
      </div>
      <LocalizedInputs prefix="name" label="Name" value={product?.name} required />
      <label className="block">
        <span className="label">Filter tags (comma-separated)</span>
        <input name="tags" defaultValue={product?.tags.join(", ")} placeholder="Android, iOS, PC, US region" className="input" />
        <span className="mt-1 block text-xs text-muted">Shown as store filters, e.g. platform or region. Use the same spelling across products.</span>
      </label>
      <LocalizedInputs prefix="description" label="Description" value={product?.description} textarea />
      <LocalizedInputs prefix="delivery" label="Delivery estimate" value={product?.delivery} />
      <details className="rounded-xl bg-surface-2 p-4">
        <summary className="cursor-pointer font-semibold">SEO</summary>
        <div className="mt-3 space-y-3">
          <LocalizedInputs prefix="seoTitle" label="SEO title" value={product?.seoTitle} />
          <LocalizedInputs prefix="seoDescription" label="SEO description" value={product?.seoDescription} />
        </div>
      </details>
      <label className="block">
        <span className="label">Customer fields (JSON)</span>
        <textarea name="fields" rows={6} defaultValue={product?.fields ?? "[]"} className="input py-2 font-mono text-xs" />
        <span className="mt-1 block text-xs text-muted">Types: text, email, number, tel. Example: <code className="whitespace-pre-wrap">{FIELD_EXAMPLE}</code></span>
      </label>
      <div className="flex flex-wrap items-center gap-5 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="isPublished" defaultChecked={product?.isPublished} /> Published</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="isFeatured" defaultChecked={product?.isFeatured} /> Featured on homepage</label>
        <label className="flex items-center gap-2">Order <input name="sortOrder" type="number" defaultValue={product?.sortOrder ?? 0} className="input w-24" /></label>
      </div>
      {msg && <p className={`rounded-xl px-4 py-2.5 text-sm ${msg.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{msg.text}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save product"}</button>
    </form>
  );
}
