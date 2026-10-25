import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { decideTrialAction } from "@/actions/admin";
import { ActionButton } from "@/components/admin/ActionButton";
import { PageTitle, Table } from "@/components/admin/ui";

export const metadata = { title: "Free trials" };

/** Free trial requests: one per account, phone, link and browser (checked automatically); staff approve or refuse. */
export default async function TrialsAdmin() {
  await requireStaff("orders.view");
  const [s, list] = await Promise.all([
    getSettings(),
    prisma.trialRequest.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { user: { select: { id: true, name: true, email: true } } } }),
  ]);
  const offer = (key: string) => s.trialOffers.find((o) => o.key === key)?.label.ht ?? key;
  return (
    <>
      <PageTitle
        title="Free trials"
        sub={`${s.trialEnabled ? "Trials on" : "Trials off"} · ${s.trialStrict ? "first top-up required" : "no top-up required"} · max ${s.trialPerDay}/day, ${s.trialPerIpPerDay} per internet connection per day. Approving creates a free order that follows the normal delivery.`}
      />
      <Table head={["Customer", "Trial", "Link", "Phone", "Status", "Date", ""]} empty={list.length === 0}>
        {list.map((r) => (
          <tr key={r.id}>
            <td className="px-4 py-3"><Link href={`/admin/customers/${r.user.id}`} className="text-primary">{r.user.name}</Link><span className="block text-xs text-muted">{r.user.email}</span></td>
            <td className="px-4 py-3">{offer(r.offer)}</td>
            <td className="max-w-[260px] break-all px-4 py-3 text-xs"><a href={r.link} target="_blank" rel="noopener noreferrer" className="text-primary">{r.link}</a></td>
            <td className="px-4 py-3 text-xs">{r.phone}</td>
            <td className="px-4 py-3 text-xs font-semibold">{r.status}{r.orderId ? <Link href={`/admin/orders/${r.orderId}`} className="ml-1 text-primary">order</Link> : null}</td>
            <td className="px-4 py-3 text-muted">{r.createdAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</td>
            <td className="px-4 py-3">
              {r.status === "PENDING" && (
                <div className="flex gap-2">
                  <ActionButton label="Approve" confirm="Send this free trial?" action={decideTrialAction.bind(null, r.id, true)} />
                  <ActionButton label="Refuse" prompt="Reason (optional)" className="btn-ghost min-h-9 px-3 text-xs text-danger" action={decideTrialAction.bind(null, r.id, false)} />
                </div>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
