import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { saveManualMethod } from "@/actions/site";
import { ActionForm } from "@/components/admin/ActionButton";
import { LocalizedInputs } from "@/components/admin/LocalizedInputs";
import { ImageField } from "@/components/admin/ImageField";
import { PageTitle } from "@/components/admin/ui";

export const metadata = { title: "Payment methods" };

type M = Awaited<ReturnType<typeof prisma.manualMethod.findMany>>[number];

function MethodForm({ m, crypto }: { m?: M; crypto?: boolean }) {
  const isCrypto = m ? m.kind === "crypto" : !!crypto;
  return (
    <ActionForm action={saveManualMethod} className={`card space-y-3 p-5 ${m ? "" : "border-dashed"}`} resetOnSuccess={!m}>
      {m && <input type="hidden" name="id" value={m.id} />}
      <input type="hidden" name="kind" value={isCrypto ? "crypto" : "mobile"} />
      <p className="flex items-center gap-2 font-semibold">
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-extrabold ${isCrypto ? "bg-[#26a17b] text-white" : "bg-surface-2"}`}>{isCrypto ? "CRYPTO · USD wallet" : "HTG"}</span>
        {m ? `Method: ${m.code}` : isCrypto ? "New crypto address (USDT)" : "New manual method"}
      </p>
      {isCrypto ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <label><span className="label">Code</span><input name="code" defaultValue={m?.code ?? "usdt-bep20"} required className="input" /></label>
          <label><span className="label">Network</span><input name="network" defaultValue={m?.network ?? "BEP-20 (BSC)"} required className="input" list="networks" /></label>
          <label><span className="label">Wallet name (shown to staff)</span><input name="recipientName" defaultValue={m?.recipientName ?? "HaitiViral"} required className="input" /></label>
          <label className="sm:col-span-3"><span className="label">Wallet address</span><input name="recipientNumber" defaultValue={m?.recipientNumber} required placeholder="0x…" className="input font-mono" spellCheck={false} autoComplete="off" /></label>
          <datalist id="networks"><option value="BEP-20 (BSC)" /><option value="Polygon" /><option value="TRC-20 (Tron)" /><option value="ERC-20 (Ethereum)" /></datalist>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <label><span className="label">Code</span><input name="code" defaultValue={m?.code} placeholder="sogebank" required className="input" /></label>
          <label><span className="label">Recipient name</span><input name="recipientName" defaultValue={m?.recipientName} required className="input" /></label>
          <label><span className="label">Number / account</span><input name="recipientNumber" defaultValue={m?.recipientNumber} required className="input" /></label>
        </div>
      )}
      <LocalizedInputs prefix="name" label="Name shown to customers" value={(m?.name ?? (isCrypto ? { ht: "USDT", fr: "USDT" } : {})) as Record<string, string>} />
      <LocalizedInputs prefix="instructions" label="Instructions (optional)" value={(m?.instructions ?? {}) as Record<string, string>} textarea />
      <div className="grid gap-4 sm:grid-cols-2">
        <ImageField
          name="qrImage"
          label="QR code (optional)"
          value={m?.qrImage}
          folder="brand"
          aspect="aspect-square"
          hint={isCrypto ? "Empty = we make a QR from the address automatically." : "Screenshot of the merchant QR customers scan. Empty = number only."}
        />
        <ImageField name="logo" label="Logo (optional)" value={m?.logo} folder="brand" aspect="aspect-[3/1]" />
      </div>
      <div className="flex flex-wrap items-center gap-5 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="isEnabled" defaultChecked={m?.isEnabled ?? true} /> Enabled</label>
        {!isCrypto && <label className="flex items-center gap-2"><input type="checkbox" name="allowOrders" defaultChecked={m?.allowOrders ?? true} /> At checkout</label>}
        <label className="flex items-center gap-2"><input type="checkbox" name="allowDeposits" defaultChecked={m?.allowDeposits ?? true} /> For wallet top-ups</label>
        <label className="flex items-center gap-2">Order <input name="sortOrder" type="number" defaultValue={m?.sortOrder ?? 0} className="input w-20" /></label>
      </div>
      {isCrypto && <p className="text-xs text-muted">Customers send USDT, paste the transaction hash, and you approve it in Payments: their USD wallet is credited 1 USDT = $1. Check the hash on the network explorer before approving. Changing the address is recorded in the audit log.</p>}
      <button className="btn-primary min-h-10">{m ? "Save" : isCrypto ? "Add crypto address" : "Create method"}</button>
    </ActionForm>
  );
}

export default async function PaymentMethodsPage() {
  await requireStaff("settings.manage");
  const [methods, s] = await Promise.all([prisma.manualMethod.findMany({ orderBy: { sortOrder: "asc" } }), getSettings()]);
  return (
    <>
      <PageTitle title="Payment methods" sub="MonCash (automatic) and NatCash are built in. Add other methods here: a bank, another wallet, or a crypto address. Customers send money, enter the reference, and you approve it in Payments. Saving asks for your authenticator code." />
      <div className="card mb-6 grid gap-2 p-5 text-sm sm:grid-cols-2">
        <p><b>MonCash</b>: {s.moncashEnabled ? "enabled" : "disabled"} (automatic)</p>
        <p>
          <b>NatCash</b>: {s.natcashEnabled ? "enabled" : "disabled"} · {s.natcashRecipientName} · {s.natcashRecipientPhone} · QR {s.natcashQrUrl ? "✓" : "none"}{" "}
          <a href="/admin/settings" className="font-semibold text-primary underline">Change number or QR</a>
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {methods.map((m) => <MethodForm key={m.id} m={m} />)}
        <MethodForm crypto />
        <MethodForm />
      </div>
    </>
  );
}
