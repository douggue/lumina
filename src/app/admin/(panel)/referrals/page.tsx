import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { t as txt } from "@/lib/text";
import { decidePayoutAction, saveReferralSettings, setReferralBlocked } from "@/actions/referrals";
import { ActionButton, ActionForm } from "@/components/admin/ActionButton";
import { PageTitle, Table } from "@/components/admin/ui";

export const metadata = { title: "Referrals" };

const money = (n: number) => formatMoney(n, "HTG", "en");
const input = "h-9 w-full rounded-lg border border-[#CBD2E1] bg-surface px-2 text-sm dark:border-border";

/**
 * Referral program: withdrawals to send (MonCash / NatCash), tier settings, recent commissions and referrals.
 * Commission = tier % of each completed order of a direct friend, available after the hold days.
 */
export default async function ReferralsAdmin() {
  await requireStaff("referrals.manage");
  const [s, payouts, commissions, list, sums] = await Promise.all([
    getSettings(),
    prisma.payout.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
    prisma.referralCommission.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.referral.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { referrer: { select: { id: true, name: true } }, referred: { select: { id: true, name: true } } } }),
    prisma.referralCommission.groupBy({ by: ["status"], _sum: { amount: true } }),
  ]);
  const users = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set([...payouts.map((p) => p.userId), ...commissions.map((c) => c.referrerId)])] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const open = payouts.filter((p) => p.status === "REQUESTED");
  const sum = (st: string) => sums.find((x) => x.status === st)?._sum.amount ?? 0;
  return (
    <>
      <PageTitle title="Referrals" sub={`${s.referralEnabled ? "Program on" : "Program OFF"} · commissions waiting ${money(sum("PENDING"))} · paid into earnings ${money(sum("AVAILABLE"))} · ${open.length} withdrawal(s) to send`} />

      <h2 className="mb-2 text-lg font-bold">Withdrawals to send</h2>
      <p className="mb-3 text-xs text-muted">Send the amount by MonCash or NatCash to the number shown (the name must match the account), then press &quot;Sent&quot; and paste the transaction reference. &quot;Reject&quot; puts the money back in the customer&apos;s earnings.</p>
      <Table head={["Customer", "Amount", "To", "Asked", "Status", ""]} empty={!payouts.length}>
        {payouts.map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-3"><Link href={`/admin/customers/${p.userId}`} className="text-primary">{users.get(p.userId) ?? p.name}</Link><span className="block text-xs text-muted">{p.name}</span></td>
            <td className="px-4 py-3 font-bold">{money(p.amount)}</td>
            <td className="px-4 py-3">{p.method === "MONCASH" ? "MonCash" : "NatCash"} · <span className="font-mono">{p.phone}</span></td>
            <td className="px-4 py-3 text-muted">{p.createdAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</td>
            <td className="px-4 py-3 text-xs font-semibold">{p.status}{p.reference ? ` · ${p.reference}` : ""}{p.note ? ` · ${p.note}` : ""}</td>
            <td className="px-4 py-3">
              {p.status === "REQUESTED" && (
                <div className="flex gap-2">
                  <ActionButton label="Sent" prompt="MonCash / NatCash transaction reference" className="btn-primary min-h-9 px-3 text-xs" action={decidePayoutAction.bind(null, p.id, true)} />
                  <ActionButton label="Reject" prompt="Reason (shown in the log)" className="btn-ghost min-h-9 px-3 text-xs text-danger" action={decidePayoutAction.bind(null, p.id, false)} />
                </div>
              )}
            </td>
          </tr>
        ))}
      </Table>

      <section className="card mt-8 space-y-4 p-5">
        <h2 className="text-lg font-bold">Program settings</h2>
        <ActionForm action={saveReferralSettings} className="space-y-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="referralEnabled" defaultChecked={s.referralEnabled} /> Referral program on</label>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="py-1.5">Tier</th><th>Commission %</th><th>Active friends (30 days)</th><th>or friends&apos; orders (HTG, 30 days)</th></tr></thead>
              <tbody>
                {s.refTiers.map((t, i) => (
                  <tr key={t.key}>
                    <td className="py-1.5 pr-2 font-semibold">{txt(t.name, "ht")}</td>
                    <td className="pr-2"><input name={`pct${i}`} defaultValue={t.pct} inputMode="numeric" className={input} aria-label={`${t.key} %`} /></td>
                    <td className="pr-2"><input name={`active${i}`} defaultValue={t.minActive} inputMode="numeric" className={input} aria-label={`${t.key} friends`} /></td>
                    <td><input name={`volume${i}`} defaultValue={t.minVolume / 100} inputMode="numeric" className={input} aria-label={`${t.key} volume`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-bold text-muted">Hold days after the order completes<input name="refHoldDays" defaultValue={s.refHoldDays} inputMode="numeric" className={`${input} mt-1`} /></label>
            <label className="text-xs font-bold text-muted">Minimum withdrawal (HTG)<input name="refMinPayout" defaultValue={s.refMinPayoutHtg / 100} inputMode="numeric" className={`${input} mt-1`} /></label>
            <label className="text-xs font-bold text-muted">Months a friend earns commission (0 = for life)<input name="refMonths" defaultValue={s.refMonths} inputMode="numeric" className={`${input} mt-1`} /></label>
          </div>
          <p className="text-xs text-muted">The highest tier&apos;s % is counted in Pricing &amp; profit (worst case). Friends who share a browser or phone number with their referrer earn nothing.</p>
          <button className="btn-primary min-h-10">Save</button>
        </ActionForm>
      </section>

      <h2 className="mb-2 mt-8 text-lg font-bold">Latest commissions</h2>
      <Table head={["Referrer", "Order", "Tier", "Commission", "Status", "Available"]} empty={!commissions.length}>
        {commissions.map((c) => (
          <tr key={c.id}>
            <td className="px-4 py-3"><Link href={`/admin/customers/${c.referrerId}`} className="text-primary">{users.get(c.referrerId) ?? "—"}</Link></td>
            <td className="px-4 py-3"><Link href={`/admin/orders/${c.orderId}`} className="text-primary">{money(c.orderTotal)}</Link></td>
            <td className="px-4 py-3 text-xs">{c.tier} · {c.pct}%</td>
            <td className="px-4 py-3 font-semibold">{money(c.amount)}</td>
            <td className="px-4 py-3 text-xs font-semibold">{c.status}</td>
            <td className="px-4 py-3 text-muted">{c.availableAt.toLocaleDateString("en-US")}</td>
          </tr>
        ))}
      </Table>

      <h2 className="mb-2 mt-8 text-lg font-bold">Referrals</h2>
      <Table head={["Referrer", "Friend", "Status", "Note", "Date", ""]} empty={list.length === 0}>
        {list.map((r) => (
          <tr key={r.id}>
            <td className="px-4 py-3"><Link href={`/admin/customers/${r.referrer.id}`} className="text-primary">{r.referrer.name}</Link></td>
            <td className="px-4 py-3"><Link href={`/admin/customers/${r.referred.id}`} className="text-primary">{r.referred.name}</Link></td>
            <td className="px-4 py-3 text-xs font-semibold">{r.status === "REWARDED" ? "EARNING" : r.status === "REJECTED" ? "BLOCKED" : "NO ORDER YET"}</td>
            <td className="px-4 py-3 text-xs text-muted">{r.note ?? ""}</td>
            <td className="px-4 py-3 text-muted">{r.createdAt.toLocaleDateString("en-US")}</td>
            <td className="px-4 py-3">
              {r.status === "REJECTED"
                ? <ActionButton label="Allow" action={setReferralBlocked.bind(null, r.id, false)} />
                : <ActionButton label="Block" confirm="Block this referral? Its waiting commissions are canceled." className="btn-ghost min-h-9 px-3 text-xs text-danger" action={setReferralBlocked.bind(null, r.id, true)} />}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
