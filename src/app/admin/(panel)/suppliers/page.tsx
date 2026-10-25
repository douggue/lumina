import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { createSupplier } from "@/actions/suppliers";
import { PRESETS } from "@/lib/suppliers/presets";
import { mockSupplierAllowed } from "@/lib/suppliers/mock";
import { PageTitle, Table } from "@/components/admin/ui";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  await requireStaff("settings.manage");
  const suppliers = await prisma.supplier.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { variants: true } } },
  });
  const counts = await prisma.supplierOrder.groupBy({ by: ["supplierId", "status"], _count: true, where: { status: { in: ["PENDING", "UNKNOWN", "FAILED"] } } });
  const count = (id: string, st: string) => counts.find((c) => c.supplierId === id && c.status === st)?._count ?? 0;
  return (
    <>
      <PageTitle title="Suppliers" sub="Products linked to a supplier are ordered from it automatically once the customer has paid." />
      <Table head={["Supplier", "Type", "Status", "Balance", "Options linked", "Needs attention"]} empty={!suppliers.length}>
        {suppliers.map((s) => (
          <tr key={s.id}>
            <td><Link href={`/admin/suppliers/${s.id}`} className="font-semibold text-primary">{s.name}</Link></td>
            <td className="text-muted">{PRESETS[s.preset]?.label ?? s.preset}</td>
            <td>{s.isEnabled ? <span className="badge bg-success-soft text-success">On</span> : <span className="badge bg-surface-2 text-muted">Off</span>}</td>
            <td className={s.lowBalance && s.balance && Number(s.balance) < Number(s.lowBalance) ? "font-semibold text-danger" : ""}>
              {s.balance != null ? `${Number(s.balance)} ${s.balanceCurrency ?? ""}` : "—"}
            </td>
            <td>{s._count.variants}</td>
            <td>
              {count(s.id, "FAILED") > 0 && <span className="badge mr-1 bg-danger-soft text-danger">{count(s.id, "FAILED")} failed</span>}
              {count(s.id, "UNKNOWN") > 0 && <span className="badge mr-1 bg-warning-soft text-warning">{count(s.id, "UNKNOWN")} unknown</span>}
              {count(s.id, "PENDING") > 0 && <span className="badge bg-surface-2">{count(s.id, "PENDING")} pending</span>}
            </td>
          </tr>
        ))}
      </Table>

      <form action={createSupplier} className="card mt-6 grid max-w-2xl gap-3 border-dashed p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <p className="font-semibold sm:col-span-3">Add a supplier</p>
        <label><span className="label">Name</span><input name="name" required maxLength={80} placeholder="MooGold" className="input" /></label>
        <label>
          <span className="label">Type</span>
          <select name="preset" className="input">
            {Object.entries(PRESETS)
              .filter(([k]) => k !== "mock" || mockSupplierAllowed())
              .map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
          </select>
        </label>
        <button className="btn-primary min-h-11">Add</button>
        <p className="text-xs text-muted sm:col-span-3">It starts switched off. Enter its keys, test it, then switch it on and link product options to it.</p>
      </form>
    </>
  );
}
