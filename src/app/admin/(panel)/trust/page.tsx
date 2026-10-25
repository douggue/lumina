import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { isExchangeProduct } from "@/lib/amount";
import { CITIES, cityFlag, shortName } from "@/lib/trust";
import { t } from "@/lib/text";
import { addFeedSale, addReview, deleteFeedSale, deleteReview, saveTrustSettings, setLowStock, updateReview } from "@/actions/trust-admin";
import { ActionButton, ActionForm } from "@/components/admin/ActionButton";
import { PageTitle, Table } from "@/components/admin/ui";

export const metadata = { title: "Trust" };

type Tab = "feed" | "reviews" | "stock";
const TABS: [Tab, string][] = [["feed", "Sale popup"], ["reviews", "Customer reviews"], ["stock", "Low stock alert"]];
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

function CitySelect({ name = "city", required = false }: { name?: string; required?: boolean }) {
  return (
    <select name={name} required={required} className="input" defaultValue="">
      <option value="" disabled={required}>{required ? "City…" : "City (optional)"}</option>
      {CITIES.map((c) => <option key={c.name} value={c.name}>{c.flag} {c.name}</option>)}
    </select>
  );
}

export default async function TrustAdmin({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireStaff("catalog.manage");
  const tab = ((await searchParams).tab as Tab) || "feed";
  const settings = await getSettings();
  const products = await prisma.product.findMany({
    orderBy: [{ isPublished: "desc" }, { sortOrder: "asc" }],
    select: { id: true, name: true, salesPopup: true, isPublished: true, fulfillmentType: true, category: { select: { id: true, parentId: true } } },
  });
  const sellable = products.filter((p) => !isExchangeProduct(settings.moneyExchange, p.category));
  const pname = (id: string | null) => t(products.find((p) => p.id === id)?.name, "en") || "—";

  return (
    <>
      <PageTitle title="Trust" sub="Recent sale popup, customer reviews and the “stock is low” message. Everything shown to customers comes from real sales and real comments." />
      <nav className="mb-6 flex flex-wrap gap-1 self-start rounded-2xl bg-surface-2 p-1" aria-label="Sections">
        {TABS.map(([id, label]) => (
          <Link key={id} href={`/admin/trust?tab=${id}`} aria-current={tab === id ? "page" : undefined} className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === id ? "bg-primary text-white" : "text-muted hover:text-text"}`}>
            {label}
          </Link>
        ))}
      </nav>
      {tab === "feed" && <FeedTab settings={settings} sellable={sellable} pname={pname} />}
      {tab === "reviews" && <ReviewsTab sellable={sellable} pname={pname} />}
      {tab === "stock" && <StockTab limit={settings.lowStockLimit} />}
    </>
  );
}

type P = { id: string; name: unknown; salesPopup: boolean; isPublished: boolean };

async function FeedTab({ settings, sellable, pname }: { settings: Awaited<ReturnType<typeof getSettings>>; sellable: P[]; pname: (id: string | null) => string }) {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [manual, site] = await Promise.all([
    prisma.saleFeedItem.findMany({ where: { soldAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, orderBy: { soldAt: "desc" }, take: 100 }),
    prisma.order.findMany({
      where: { status: "FULFILLED", fulfilledAt: { gte: since } },
      orderBy: { fulfilledAt: "desc" },
      take: 50,
      select: { id: true, fulfilledAt: true, user: { select: { name: true, city: true, showInFeed: true } }, items: { take: 1, select: { variant: { select: { productId: true } } } } },
    }),
  ]);
  const rows = [
    ...site.map((o) => {
      const reason = !o.user.showInFeed ? "Customer turned it off" : !o.user.city ? "No city on the account" : "";
      return { key: o.id, name: shortName(o.user.name), city: o.user.city, product: o.items[0]?.variant.productId ?? null, at: o.fulfilledAt!, source: "Site", reason, del: null as string | null };
    }),
    ...manual.map((m) => ({ key: m.id, name: m.name, city: m.city, product: m.productId, at: m.soldAt, source: "WhatsApp", reason: m.soldAt < since ? "Older than 7 days" : "", del: m.id })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="space-y-3">
        <h2 className="font-bold">Sales in the popup</h2>
        <p className="text-sm text-muted">Delivered site orders (customers who picked a city and didn&apos;t opt out) and the WhatsApp sales you add. Only the last 7 days are shown to customers, only on ticked products.</p>
        <Table head={["Customer", "City", "Product", "Date", "Source", ""]} empty={rows.length === 0}>
          {rows.map((r) => (
            <tr key={r.key} className={r.reason ? "opacity-60" : ""}>
              <td className="px-4 py-3 font-semibold">{r.name}</td>
              <td className="px-4 py-3">{r.city ? `${cityFlag(r.city)} ${r.city}` : "—"}</td>
              <td className="px-4 py-3">{pname(r.product)}</td>
              <td className="px-4 py-3 text-muted">{day(r.at)}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.source === "WhatsApp" ? "bg-success-soft text-success" : "bg-primary-soft text-primary"}`}>{r.source}</span>
                {r.reason && <span className="mt-1 block text-xs text-muted">Not shown: {r.reason}</span>}
              </td>
              <td className="px-4 py-3">{r.del && <ActionButton label="Remove" className="btn-ghost min-h-9 px-3 text-xs text-danger" confirm="Remove this sale from the popup?" action={deleteFeedSale.bind(null, r.del)} />}</td>
            </tr>
          ))}
        </Table>
      </section>

      <div className="space-y-6">
        <ActionForm action={addFeedSale} resetOnSuccess className="card space-y-3 p-5">
          <h2 className="font-bold">+ Add a WhatsApp sale</h2>
          <p className="text-xs text-muted">For real sales you made outside the site. Only the first name and last initial are kept.</p>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <input name="first" required maxLength={24} placeholder="First name (Jean)" className="input" />
            <input name="last" maxLength={30} placeholder="Last (P.)" className="input" />
          </div>
          <CitySelect required />
          <select name="productId" required className="input" defaultValue="">
            <option value="" disabled>Product…</option>
            {sellable.filter((p) => p.isPublished).map((p) => <option key={p.id} value={p.id}>{t(p.name, "en")}</option>)}
          </select>
          <label className="block text-sm"><span className="label">Sale date</span><input type="date" name="soldOn" defaultValue={today} max={today} className="input" /></label>
          <button className="btn-primary w-full">Add to the feed</button>
        </ActionForm>

        <ActionForm action={saveTrustSettings} className="card space-y-4 p-5">
          <h2 className="font-bold">Popup settings</h2>
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">
            Popup on
            <input type="checkbox" name="enabled" defaultChecked={settings.salesPopupEnabled} className="h-5 w-5 accent-[var(--primary)]" />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            Popups per visit (1–5)
            <input type="number" name="perVisit" min={1} max={5} defaultValue={settings.salesPopupPerVisit} className="input w-20" />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            “Stock is low” when codes left ≤
            <input type="number" name="lowLimit" min={1} max={100} defaultValue={settings.lowStockLimit} className="input w-20" />
          </label>
          <p className="text-xs text-muted">First popup after ~10 s, then every 40–60 s. Never on the cart or payment pages, never with data saver, gone for the visit once closed. Money exchange products never show it.</p>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Products that show the popup</legend>
            <div className="flex flex-wrap gap-2">
              {sellable.map((p) => (
                <label key={p.id} className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                  <input type="checkbox" name="popup" value={p.id} defaultChecked={p.salesPopup} className="accent-[var(--primary)]" />
                  {t(p.name, "en")}{!p.isPublished && " (hidden)"}
                </label>
              ))}
            </div>
          </fieldset>
          <button className="btn-primary w-full">Save</button>
        </ActionForm>
      </div>
    </div>
  );
}

async function ReviewsTab({ sellable, pname }: { sellable: P[]; pname: (id: string | null) => string }) {
  const reviews = await prisma.review.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 });
  const pending = reviews.filter((r) => r.status === "pending").length;
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section className="space-y-3">
        <h2 className="font-bold">Reviews {pending > 0 && <span className="ml-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning">{pending} new</span>}</h2>
        <p className="text-sm text-muted">Customers are asked “How was it?” on their order once it&apos;s delivered. Approve the good ones and tick “Homepage” to show them in the reviews section (hidden until at least one is ticked).</p>
        <Table head={["Rating", "Comment", "Customer", "Product", "Status", ""]} empty={reviews.length === 0}>
          {reviews.map((r) => (
            <tr key={r.id} className={r.status === "hidden" ? "opacity-50" : ""}>
              <td className="whitespace-nowrap px-4 py-3 text-[#e0a400]">{"★".repeat(r.rating)}<span className="text-border">{"★".repeat(5 - r.rating)}</span></td>
              <td className="max-w-xs px-4 py-3">{r.quote ? `“${r.quote}”` : <span className="text-muted">(stars only)</span>}</td>
              <td className="px-4 py-3">{r.name}{r.city && <span className="block text-xs text-muted">{cityFlag(r.city)} {r.city}</span>}<span className="block text-xs text-muted">{r.source === "order" ? "After delivery" : "Added by staff"} · {day(r.createdAt)}</span></td>
              <td className="px-4 py-3">{pname(r.productId)}</td>
              <td className="px-4 py-3 text-xs font-bold">{r.onHome ? <span className="text-success">✓ On homepage</span> : r.status === "approved" ? "Approved" : r.status === "hidden" ? "Hidden" : <span className="text-warning">New</span>}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  {!r.onHome && r.quote && <ActionButton label="Homepage" action={updateReview.bind(null, r.id, { onHome: true })} />}
                  {r.onHome && <ActionButton label="Off homepage" action={updateReview.bind(null, r.id, { onHome: false })} />}
                  {r.status === "pending" && <ActionButton label="Approve" action={updateReview.bind(null, r.id, { status: "approved" })} />}
                  {r.status !== "hidden" ? (
                    <ActionButton label="Hide" className="btn-ghost min-h-9 px-3 text-xs" action={updateReview.bind(null, r.id, { status: "hidden" })} />
                  ) : (
                    <ActionButton label="Delete" className="btn-ghost min-h-9 px-3 text-xs text-danger" confirm="Delete this review for good?" action={deleteReview.bind(null, r.id)} />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </section>

      <ActionForm action={addReview} resetOnSuccess className="card h-fit space-y-3 p-5">
        <h2 className="font-bold">+ Add a customer comment</h2>
        <p className="text-xs text-muted">A real comment a customer sent you (WhatsApp, Facebook…). Ask them first if you can show it with their first name and city.</p>
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <input name="first" required maxLength={24} placeholder="First name" className="input" />
          <input name="last" maxLength={30} placeholder="Last (M.)" className="input" />
        </div>
        <CitySelect />
        <select name="rating" defaultValue="5" className="input">
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}
        </select>
        <textarea name="quote" required minLength={5} maxLength={400} rows={4} placeholder="Their comment, word for word" className="input min-h-28 py-3" />
        <select name="productId" className="input" defaultValue="">
          <option value="">Product (optional)</option>
          {sellable.map((p) => <option key={p.id} value={p.id}>{t(p.name, "en")}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="onHome" defaultChecked className="h-4 w-4 accent-[var(--primary)]" /> Show on the homepage</label>
        <button className="btn-primary w-full">Add review</button>
      </ActionForm>
    </div>
  );
}

async function StockTab({ limit }: { limit: number }) {
  const products = await prisma.product.findMany({
    where: { isPublished: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      fulfillmentType: true,
      variants: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, lowStock: true, lowStockUntil: true, _count: { select: { codes: { where: { status: "AVAILABLE" } } } } } },
    },
  });
  const now = Date.now();
  return (
    <section className="space-y-3">
      <p className="text-sm text-muted">
        Customers see “Stock is running low” with no number. <b>Automatic</b> (products delivered with codes): shows when {limit} codes or fewer are left, hides when you add codes. <b>On</b>: for top-ups delivered by hand, turn it on when your supplier is really low; set days so it turns itself off.
      </p>
      <Table head={["Product · option", "Stock", "Mode", "Customers see"]} empty={products.length === 0}>
        {products.flatMap((p) =>
          p.variants.map((v) => {
            const codes = p.fulfillmentType === "CODE_INVENTORY";
            const left = v._count.codes;
            const showing = v.lowStock === "on" ? !v.lowStockUntil || v.lowStockUntil.getTime() > now : v.lowStock === "auto" && codes && left > 0 && left <= limit;
            return (
              <tr key={v.id}>
                <td className="px-4 py-3"><b>{t(p.name, "en")}</b><span className="block text-xs text-muted">{t(v.name, "en")}</span></td>
                <td className="px-4 py-3 text-muted">{codes ? `${left} codes` : "Delivered by hand"}</td>
                <td className="px-4 py-3">
                  <ActionForm action={setLowStock.bind(null, v.id)} className="flex flex-wrap items-center gap-2">
                    <select name="mode" defaultValue={v.lowStock} className="input h-10 w-auto py-0">
                      <option value="off">Off</option>
                      {codes && <option value="auto">Automatic</option>}
                      <option value="on">On</option>
                    </select>
                    <input name="days" type="number" min={0} max={60} placeholder="days" title="Turn off after this many days (On only; empty = until you turn it off)" className="input h-10 w-20 py-0" />
                    <button className="btn-secondary min-h-10 px-3 text-xs">Save</button>
                  </ActionForm>
                  {v.lowStock === "on" && v.lowStockUntil && <span className="mt-1 block text-xs text-muted">Until {day(v.lowStockUntil)}</span>}
                </td>
                <td className={`px-4 py-3 text-xs font-bold ${showing ? "text-warning" : "text-muted"}`}>{showing ? "⚠ Stock is running low" : "Nothing"}</td>
              </tr>
            );
          }),
        )}
      </Table>
    </section>
  );
}
