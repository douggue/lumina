import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { Reconciler } from "@/components/admin/Reconciler";
import { PageTitle } from "@/components/admin/ui";

export const metadata = { title: "Reconciliation" };

export default async function ReconciliationPage() {
  await requireStaff("payments.review");
  const methods = await prisma.manualMethod.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, code: true } });
  return (
    <>
      <PageTitle title="Reconciliation" sub="Upload the statement exported from MonCash, NatCash or your bank (CSV with reference and amount columns). We compare it with the payments recorded here. Nothing is changed automatically." />
      <Reconciler providers={[{ value: "NATCASH", label: "NatCash" }, { value: "MONCASH", label: "MonCash" }, ...methods.map((m) => ({ value: `MANUAL:${m.id}`, label: m.code }))]} />
    </>
  );
}
