import { siteUrl } from "@/lib/site-url";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { emailEnabled } from "@/lib/email";
import { PageTitle, Stat, Table } from "@/components/admin/ui";

export const metadata = { title: "Newsletter" };

export default async function NewsletterAdmin() {
  await requireStaff("content.manage");
  const [s, subs, active] = await Promise.all([
    getSettings(),
    prisma.newsletterSubscriber.findMany({ orderBy: { consentAt: "desc" }, take: 200 }),
    prisma.newsletterSubscriber.count({ where: { unsubscribedAt: null } }),
  ]);
  return (
    <>
      <PageTitle
        title="Newsletter"
        sub={`Sign-up form: ${s.newsletterEnabled ? "on" : "off"} (Settings → Referral program section). Sending campaigns ${emailEnabled() ? "can use Resend" : "needs the Resend domain"}; until then export the list for another tool. Every email must include the unsubscribe link: ${siteUrl()}/ht/newsletter/unsubscribe?t=TOKEN`}
        actions={<a className="btn-secondary" href="/api/admin/export?type=newsletter">Export CSV</a>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md"><Stat label="Subscribed" value={active} /><Stat label="Unsubscribed" value={subs.filter((x) => x.unsubscribedAt).length} /></div>
      <Table head={["Email", "Language", "Consent", "Status"]} empty={subs.length === 0}>
        {subs.map((x) => (
          <tr key={x.id}>
            <td className="px-4 py-2.5">{x.email}</td>
            <td className="px-4 py-2.5 text-xs">{x.locale.toUpperCase()}</td>
            <td className="px-4 py-2.5 text-muted">{x.consentAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</td>
            <td className="px-4 py-2.5 text-xs">{x.unsubscribedAt ? "Unsubscribed" : "Subscribed"}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
