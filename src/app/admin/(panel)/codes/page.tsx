import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { t } from "@/lib/text";
import { importCodes } from "@/actions/admin";
import { ActionForm } from "@/components/admin/ActionButton";
import { PageTitle, Table } from "@/components/admin/ui";

export const metadata = { title: "Code inventory" };

export default async function CodesPage({ searchParams }: { searchParams: Promise<{ variant?: string }> }) {
  await requireStaff("codes.manage");
  const sp = await searchParams;
  const variants = await prisma.productVariant.findMany({
    where: { product: { fulfillmentType: "CODE_INVENTORY" } },
    include: { product: true },
    orderBy: [{ product: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });
  const counts = await prisma.codeItem.groupBy({ by: ["variantId", "status"], _count: true });
  const count = (v: string, s: string) => counts.find((c) => c.variantId === v && c.status === s)?._count ?? 0;
  return (
    <>
      <PageTitle title="Code inventory" sub="Codes are encrypted when imported and never shown in lists. Duplicates are skipped automatically." />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <ActionForm action={importCodes} className="card h-fit space-y-4 p-5" resetOnSuccess>
          <h2 className="font-semibold">Import codes</h2>
          <label className="block"><span className="label">Variant</span>
            <select name="variantId" defaultValue={sp.variant} className="input" required>
              {variants.map((v) => <option key={v.id} value={v.id}>{t(v.product.name, "en")} — {t(v.name, "en")}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label><span className="label">Batch label</span><input name="batchLabel" className="input" placeholder="Supplier invoice #" /></label>
            <label><span className="label">Cost per code (HTG)</span><input name="cost" className="input" inputMode="decimal" /></label>
          </div>
          <label className="block"><span className="label">Codes (one per line)</span><textarea name="codes" rows={8} className="input py-2 font-mono text-xs" required autoComplete="off" spellCheck={false} /></label>
          <button className="btn-primary">Import</button>
        </ActionForm>
        <Table head={["Product / variant", "Available", "Assigned"]} empty={variants.length === 0}>
          {variants.map((v) => {
            const a = count(v.id, "AVAILABLE");
            return (
              <tr key={v.id}>
                <td className="px-4 py-3">{t(v.product.name, "en")} — {t(v.name, "en")}</td>
                <td className={`px-4 py-3 font-bold ${a === 0 ? "text-danger" : a < 3 ? "text-warning" : ""}`}>{a}</td>
                <td className="px-4 py-3 text-muted">{count(v.id, "ASSIGNED")}</td>
              </tr>
            );
          })}
        </Table>
      </div>
    </>
  );
}
