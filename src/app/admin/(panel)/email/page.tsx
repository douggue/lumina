import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { emailEnabled, emailFrom, previewEmail, resendKey } from "@/lib/email";
import { TestEmailForm } from "@/components/admin/TestEmailForm";
import { PageTitle, Stat, Table } from "@/components/admin/ui";

export const metadata = { title: "Email" };

export default async function Email({ searchParams }: { searchParams: Promise<{ preview?: string; lang?: string }> }) {
  await requireStaff("settings.manage");
  const sp = await searchParams;
  const kind = sp.preview === "verify" ? "verify" : "reset";
  const lang = ["ht", "fr"].includes(sp.lang ?? "") ? sp.lang! : "ht";
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [logs, counts] = await Promise.all([
    prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.emailLog.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: true }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const on = emailEnabled();
  const from = emailFrom();
  const preview = previewEmail(kind, lang);
  // Never show the key itself: only enough to compare with the one in Resend.
  const key = resendKey();
  const fromDomain = /@([^>\s]+)>?\s*$/.exec(from)?.[1]?.toLowerCase() ?? "";
  const checks = [
    {
      label: "RESEND_API_KEY",
      ok: /^re_[A-Za-z0-9_]{20,}$/.test(key),
      detail: !key ? "is missing." : !key.startsWith("re_") ? "does not start with re_ — it is not a Resend key." : key.length < 30 ? `looks too short (${key.length} characters, starts ${key.slice(0, 6)}…). It was probably cut when copying: copy it again with Resend's copy button.` : `is set (${key.length} characters, starts ${key.slice(0, 6)}…).`,
    },
    {
      label: "EMAIL_FROM",
      ok: !!fromDomain && !fromDomain.endsWith("vercel.app"),
      detail: !from ? "is missing. Example: HaitiViral <noreply@yourdomain.com>" : !fromDomain ? `"${from}" has no email address in it. Example: HaitiViral <noreply@yourdomain.com>` : fromDomain.endsWith("vercel.app") ? "uses vercel.app, which cannot be verified in Resend. Use your own domain." : fromDomain === "resend.dev" ? "uses resend.dev: test mode, emails only reach your own Resend account email." : `sends from ${fromDomain}. This domain must show "Verified" in Resend → Domains.`,
    },
  ];
  return (
    <>
      <PageTitle title="Email" sub="Delivery status, a test send, recent messages and template previews." />
      <div className={`card mb-6 p-4 text-sm ${on ? "border-success" : "border-warning"}`}>
        {on ? (
          <p><span className="font-semibold text-success">Email is on.</span> Sending from <span className="font-mono">{from}</span> through Resend.</p>
        ) : (
          <p><span className="font-semibold text-warning">Email is off.</span> Password resets go through WhatsApp support and the one-time link in Admin → Customers. To turn it on: verify your domain in Resend, then set <span className="font-mono">RESEND_API_KEY</span> and <span className="font-mono">EMAIL_FROM</span> in Vercel and redeploy.</p>
        )}
      </div>
      <section className="card mb-6 p-5 text-sm">
        <h2 className="mb-3 font-bold">Setup check</h2>
        <ul className="space-y-2">
          {checks.map((c) => (
            <li key={c.label} className="flex gap-2">
              <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-black text-white ${c.ok ? "bg-success" : "bg-danger"}`}>{c.ok ? "✓" : "!"}</span>
              <span><b>{c.label}</b> <span className="text-muted">{c.detail}</span></span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">After changing a value in Vercel → Settings → Environment Variables, redeploy (Deployments → ⋯ → Redeploy) so the site uses it. Then try "Send test email": if Resend refuses, the reason appears there.</p>
      </section>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Sent (7 days)" value={count("sent")} />
        <Stat label="Failed (7 days)" value={count("failed")} tone={count("failed") ? "danger" : undefined} />
        <Stat label="Skipped, email off (7 days)" value={count("skipped")} tone={count("skipped") ? "warn" : undefined} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Send a test</h2>
          <TestEmailForm disabled={!on} />
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Template preview</h2>
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            {(["reset", "verify"] as const).map((k) => <a key={k} href={`?preview=${k}&lang=${lang}`} className={`badge ${kind === k ? "bg-primary text-white" : "bg-surface-2"}`}>{k === "reset" ? "Password reset" : "Confirm email"}</a>)}
            {["ht", "fr"].map((l) => <a key={l} href={`?preview=${kind}&lang=${l}`} className={`badge ${lang === l ? "bg-primary text-white" : "bg-surface-2"}`}>{l.toUpperCase()}</a>)}
          </div>
          <p className="mb-2 text-sm"><span className="text-muted">Subject:</span> {preview.subject}</p>
          <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-80 w-full rounded-xl border border-border bg-white" />
        </section>
      </div>

      <h2 className="mb-3 mt-8 font-semibold">Recent messages</h2>
      <Table head={["When", "To", "Subject", "Status"]} empty={logs.length === 0}>
        {logs.map((l) => (
          <tr key={l.id}>
            <td className="px-4 py-3 text-xs">{l.createdAt.toLocaleString("en-US")}</td>
            <td className="px-4 py-3">{l.to}</td>
            <td className="px-4 py-3">{l.subject}</td>
            <td className="px-4 py-3">
              <span className={`badge ${l.status === "sent" ? "bg-success-soft text-success" : l.status === "failed" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}`}>{l.status}</span>
              {l.error && <p className="mt-1 max-w-xs break-words text-xs text-muted">{l.error}</p>}
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
