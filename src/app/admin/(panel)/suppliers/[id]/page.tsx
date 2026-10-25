import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { siteUrl } from "@/lib/site-url";
import { saveSupplier, supplierOrderAction, testSupplier } from "@/actions/suppliers";
import { secretsOf } from "@/lib/suppliers/engine";
import { PRESETS } from "@/lib/suppliers/presets";
import { isSmm } from "@/lib/suppliers/smm-orders";
import type { SupplierConfig } from "@/lib/suppliers/types";
import { ActionButton, ActionForm } from "@/components/admin/ActionButton";
import { PageTitle, Table } from "@/components/admin/ui";
import { CopyButton } from "@/components/CopyButton";

export const metadata = { title: "Supplier" };

const TONE: Record<string, string> = {
  SUCCESS: "bg-success-soft text-success",
  FAILED: "bg-danger-soft text-danger",
  UNKNOWN: "bg-warning-soft text-warning",
  PENDING: "bg-surface-2",
  QUEUED: "bg-surface-2",
  SENDING: "bg-surface-2",
  CLOSED: "bg-surface-2 text-muted",
};

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("settings.manage");
  const { id } = await params;
  const s = await prisma.supplier.findUnique({ where: { id } });
  if (!s) notFound();
  const cfg = s.config as unknown as SupplierConfig;
  const smm = isSmm(s.preset);
  const saved = secretsOf(s);
  const preset = PRESETS[s.preset];
  const [orders, logs, variants] = await Promise.all([
    prisma.supplierOrder.findMany({
      where: { supplierId: id },
      orderBy: [{ updatedAt: "desc" }],
      take: 40,
      include: { orderItem: { select: { productName: true, variantName: true, quantity: true, order: { select: { id: true, number: true } } } } },
    }),
    prisma.supplierLog.findMany({ where: { supplierId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.productVariant.findMany({ where: { supplierId: id }, select: { id: true, name: true, supplierSku: true, product: { select: { id: true, name: true } } } }),
  ]);
  const callback = `${siteUrl()}/api/suppliers/callback/${s.callbackToken}`;
  const en = (v: unknown) => ((v ?? {}) as Record<string, string>).en ?? Object.values((v ?? {}) as Record<string, string>)[0] ?? "";

  return (
    <>
      <PageTitle
        title={s.name}
        sub={`${preset?.label ?? s.preset} · ${s.isEnabled ? "On" : "Off"}${s.balance != null ? ` · balance ${Number(s.balance)} ${s.balanceCurrency ?? ""}` : ""}`}
        actions={<Link href="/admin/suppliers" className="btn-secondary min-h-9 px-3 text-xs">All suppliers</Link>}
      />
      {cfg.notes && <p className="mb-4 rounded-xl bg-surface-2 px-4 py-3 text-sm">{cfg.notes}</p>}

      <div className="grid gap-6 xl:grid-cols-2">
        <ActionForm action={saveSupplier} className="card space-y-3 p-5">
          <input type="hidden" name="id" value={s.id} />
          <p className="font-semibold">Settings</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="label">Name</span><input name="name" defaultValue={s.name} className="input" /></label>
            <label><span className="label">Warn when balance is under</span><input name="lowBalance" defaultValue={s.lowBalance != null ? String(Number(s.lowBalance)) : ""} inputMode="decimal" className="input" /></label>
            <label className="sm:col-span-2"><span className="label">API address</span><input name="baseUrl" defaultValue={s.baseUrl} required className="input font-mono text-xs" spellCheck={false} /></label>
          </div>
          <p className="pt-2 text-sm font-semibold">Keys</p>
          <p className="text-xs text-muted">Saved keys are never shown again. Leave a field blank to keep the saved key.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {cfg.secrets.map((n) => (
              <label key={n}>
                <span className="label">{n} {saved[n] ? <span className="text-success">· saved</span> : <span className="text-danger">· missing</span>}</span>
                <input name={`secret_${n}`} type="password" autoComplete="new-password" placeholder={saved[n] ? "••••••••" : ""} className="input font-mono" spellCheck={false} />
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 pt-1 text-sm"><input type="checkbox" name="isEnabled" defaultChecked={s.isEnabled} /> Supplier on (orders are sent to it)</label>
          <details className="rounded-xl border border-border p-3">
            <summary className="cursor-pointer text-sm font-semibold">Advanced: requests and replies (JSON)</summary>
            <p className="mt-2 text-xs text-muted">
              Templates: {"{{ref}} {{sku}} {{skuParts.0}} {{quantity}} {{fields.playerId}} {{email}} {{callbackUrl}} {{secret.NAME}} {{token}} {{timestamp}} {{body}} {{params}}"}. Filters: md5, sha1, sha256, hmac_sha256:secret.NAME, base64, upper, lower, append:…, sorted_query, json.
            </p>
            <textarea name="config" defaultValue={JSON.stringify(cfg, null, 2)} rows={18} spellCheck={false} className="input mt-2 font-mono text-xs" />
          </details>
          <button className="btn-primary min-h-10">Save</button>
        </ActionForm>

        <div className="space-y-6">
          <section className="card space-y-3 p-5">
            <p className="font-semibold">Test (nothing is ordered)</p>
            <div className="flex flex-wrap gap-2">
              {(cfg.balance || smm) && <ActionButton action={testSupplier.bind(null, s.id, "balance")} label="Check balance" />}
              {cfg.token && !smm && <ActionButton action={testSupplier.bind(null, s.id, "token")} label="Test login" />}
              {(cfg.status || smm) && <ActionButton action={testSupplier.bind(null, s.id, "status")} label="Check an order" prompt="Our reference (hv-…) to check" />}
            </div>
            <div>
              <span className="label">Callback URL (give it to the supplier if it can notify you)</span>
              <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
                <code className="flex-1 break-all text-xs">{callback}</code>
                <CopyButton value={callback} label="Copy" done="Copied" />
              </div>
            </div>
            <p className="text-xs text-muted">Most suppliers only accept requests from a fixed server address (IP allowlist). Vercel's addresses change, so ask the supplier if they need one before going live.</p>
          </section>

          <section className="card p-5">
            <p className="mb-2 font-semibold">Product options using it ({variants.length})</p>
            {variants.length ? (
              <ul className="space-y-1 text-sm">
                {variants.map((v) => (
                  <li key={v.id}>
                    <Link href={`/admin/products/${v.product.id}`} className="text-primary">{en(v.product.name)} — {en(v.name)}</Link>{" "}
                    <code className="text-xs text-muted">{v.supplierSku || "no code!"}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">None yet. In Admin → Products, set the product&apos;s delivery to &quot;Supplier API&quot;, then pick this supplier and its product code on each option. {preset?.skuHelp && `(Code format: ${preset.skuHelp})`}</p>
            )}
          </section>
        </div>
      </div>

      <h2 className="mb-3 mt-10 text-lg font-semibold">Orders sent to {s.name}</h2>
      <Table head={["Order", "Item", "Reference", "Status", "Last message", ""]} empty={!orders.length}>
        {orders.map((o) => (
          <tr key={o.id}>
            <td><Link href={`/admin/orders/${o.orderItem.order.id}`} className="text-primary">#{o.orderItem.order.number}</Link></td>
            <td>{en(o.orderItem.productName)} — {en(o.orderItem.variantName)} × {o.orderItem.quantity}</td>
            <td><code className="text-xs">{o.ref}</code>{o.supplierOrderId && <><br /><code className="text-xs text-muted">{o.supplierOrderId}</code></>}</td>
            <td><span className={`badge ${TONE[o.status]}`}>{o.status}</span>{o.checks > 0 && <span className="ml-1 text-xs text-muted">{o.checks} checks</span>}</td>
            <td className="max-w-xs text-xs text-muted">{o.message}</td>
            <td className="space-x-1 whitespace-nowrap">
              {["PENDING", "UNKNOWN", "FAILED"].includes(o.status) && <ActionButton action={supplierOrderAction.bind(null, o.id, "check")} label="Check now" />}
              {o.status === "FAILED" && <ActionButton action={supplierOrderAction.bind(null, o.id, "retry")} label="Send again" confirm="Send this order to the supplier again with a new reference?" />}
              {["PENDING", "UNKNOWN", "FAILED"].includes(o.status) && (
                <ActionButton action={supplierOrderAction.bind(null, o.id, "close")} label="Close" prompt="What happened? (delivered by hand, refunded, confirmed on the supplier's site…)" />
              )}
            </td>
          </tr>
        ))}
      </Table>

      <h2 className="mb-3 mt-10 text-lg font-semibold">Request log</h2>
      <p className="mb-3 text-sm text-muted">Keys, tokens and delivered codes are removed before saving.</p>
      <div className="space-y-2">
        {logs.map((l) => (
          <details key={l.id} className="card p-3">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{l.op}</span>
              <span className={`badge ${TONE[l.outcome] ?? "bg-surface-2"}`}>{l.outcome}</span>
              <span className="text-muted">{l.httpStatus ?? "no reply"} · {l.ms} ms · {l.createdAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "medium" })}</span>
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface-2 p-3 text-xs">{l.request}</pre>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface-2 p-3 text-xs">{l.response || "(empty)"}</pre>
          </details>
        ))}
        {!logs.length && <p className="text-sm text-muted">No requests yet.</p>}
      </div>
    </>
  );
}
