import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession, requireStaff } from "@/lib/session";
import { revokeAllSessions, revokeSession } from "@/actions/ops";
import { ActionButton } from "@/components/admin/ActionButton";
import { PageTitle, Stat, Table } from "@/components/admin/ui";
import { checkDatabase, serviceStatus } from "@/lib/health";

export const metadata = { title: "Security" };

const SECURITY_ACTIONS = ["staff.role", "staff.2fa_reset", "staff.step_up", "session.revoke", "session.revoke_all", "password.reset_link", "customer.status", "role.delete", "settings.update", "code.view.staff", "evidence.view", "export.csv"];

function browser(ua: string | null) {
  if (!ua) return "Unknown";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const b = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${b}${os ? ` · ${os}` : ""}`;
}

export default async function Security() {
  await requireStaff("staff.manage");
  const current = await getSession();
  const [sessions, events, shared, noTwoFa] = await Promise.all([
    prisma.session.findMany({
      where: { expiresAt: { gt: new Date() }, user: { role: { not: "CUSTOMER" } } },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.auditEvent.findMany({ where: { action: { in: SECURITY_ACTIONS } }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.$queryRaw<{ deviceId: string; accounts: bigint; lastSeen: Date }[]>`
      SELECT "deviceId", COUNT(DISTINCT "userId") AS accounts, MAX("lastSeen") AS "lastSeen"
      FROM "DeviceSeen" GROUP BY "deviceId" HAVING COUNT(DISTINCT "userId") > 1
      ORDER BY accounts DESC, "lastSeen" DESC LIMIT 20`,
    prisma.user.count({ where: { role: { not: "CUSTOMER" }, OR: [{ twoFactorEnabled: false }, { twoFactorEnabled: null }] } }),
  ]);
  const services = serviceStatus();
  const db = await checkDatabase();
  const serviceRows: [string, boolean | string, string][] = [
    ["Database", db.ok, db.ok ? `${db.ms} ms` : db.error ?? "down"],
    ["Auth secret", services.authSecret, "BETTER_AUTH_SECRET"],
    ["Encryption key", services.encryptionKey, "ENCRYPTION_KEY — back it up; codes cannot be read without it"],
    ["Image & screenshot storage", services.blobStorage, "Vercel Blob"],
    ["MonCash", services.moncash, services.moncash === "mock" ? "mock mode (no keys)" : services.moncash],
    ["Email", services.email, "Resend"],
    ["Bot check", services.turnstile, "Cloudflare Turnstile"],
    ["Error monitoring", services.sentry, "Sentry"],
    ["Scheduled jobs", services.cronSecret, "CRON_SECRET"],
  ];
  const actorIds = [...new Set(events.map((e) => e.actorId).filter((x): x is string => !!x))];
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const sharedRows = shared.length ? await prisma.deviceSeen.findMany({ where: { deviceId: { in: shared.map((s) => s.deviceId) } } }) : [];
  const sharedUserMap = new Map(
    (await prisma.user.findMany({ where: { id: { in: [...new Set(sharedRows.map((r) => r.userId))] } }, select: { id: true, name: true, status: true } })).map((u) => [u.id, u]),
  );
  const sharedUsers = sharedRows.flatMap((r) => (sharedUserMap.has(r.userId) ? [{ id: r.id, deviceId: r.deviceId, user: sharedUserMap.get(r.userId)! }] : []));

  return (
    <>
      <PageTitle title="Security" sub="Who is signed in to the admin, recent sensitive actions, and browsers shared by several customer accounts." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active staff sessions" value={sessions.length} />
        <Stat label="Staff without 2FA" value={noTwoFa} tone={noTwoFa ? "warn" : undefined} />
        <Stat label="Shared browsers" value={shared.length} tone={shared.length ? "warn" : undefined} />
        <Stat label="Sensitive actions (last 50)" value={events.length} />
      </div>

      <h2 className="mb-3 mt-8 font-semibold">Services</h2>
      <div className="card divide-y divide-border text-sm">
        {serviceRows.map(([name, on, note]) => {
          const good = on === true || on === "live" || on === "sandbox";
          return (
            <div key={name} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span className="font-medium">{name}</span>
              <span className="flex items-center gap-2 text-xs text-muted">
                {note}
                <span className={`badge ${good ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{good ? "on" : "off"}</span>
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">Uptime monitors can watch <span className="font-mono">/api/health</span>.</p>

      <h2 className="mb-3 mt-8 font-semibold">Staff sessions</h2>
      <Table head={["Staff", "Device", "IP", "Last active", ""]} empty={sessions.length === 0}>
        {sessions.map((s) => (
          <tr key={s.id}>
            <td className="px-4 py-3"><p className="font-medium">{s.user.name}</p><p className="text-xs text-muted">{s.user.role}</p></td>
            <td className="px-4 py-3">{browser(s.userAgent)}{current?.session.id === s.id && <span className="badge ml-2 bg-success-soft text-success">this session</span>}</td>
            <td className="px-4 py-3 font-mono text-xs">{s.ipAddress ?? "—"}</td>
            <td className="px-4 py-3 text-xs">{s.updatedAt.toLocaleString("en-US")}</td>
            <td className="px-4 py-3 text-right">
              {current?.session.id !== s.id && (
                <span className="inline-flex flex-wrap justify-end gap-2">
                  <ActionButton label="Sign out" confirm="Sign this session out?" action={revokeSession.bind(null, s.id)} />
                  <ActionButton label="All devices" className="btn-danger min-h-9 px-3 text-xs" confirm={`Sign ${s.user.name} out everywhere?`} action={revokeAllSessions.bind(null, s.user.id)} />
                </span>
              )}
            </td>
          </tr>
        ))}
      </Table>

      <h2 className="mb-3 mt-8 font-semibold">Browsers used by several accounts</h2>
      {shared.length === 0 ? (
        <p className="card p-5 text-sm text-muted">No browser has been used by more than one account.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shared.map((d) => (
            <div key={d.deviceId} className="card p-4 text-sm">
              <p className="mb-2 text-xs text-muted">{Number(d.accounts)} accounts · last seen {d.lastSeen.toLocaleString("en-US")}</p>
              <ul className="space-y-1">
                {sharedUsers.filter((u) => u.deviceId === d.deviceId).map((u) => (
                  <li key={u.id}><Link className="text-primary" href={`/admin/customers/${u.user.id}`}>{u.user.name}</Link> {u.user.status !== "ACTIVE" && <span className="text-xs text-muted">({u.user.status})</span>}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 font-semibold">Recent sensitive actions</h2>
      <Table head={["When", "Who", "Action", "Target", "IP"]} empty={events.length === 0}>
        {events.map((e) => (
          <tr key={e.id}>
            <td className="px-4 py-3 text-xs">{e.createdAt.toLocaleString("en-US")}</td>
            <td className="px-4 py-3">{(e.actorId && actors.get(e.actorId)) ?? "System"}</td>
            <td className="px-4 py-3 font-mono text-xs">{e.action}</td>
            <td className="px-4 py-3 text-xs">{e.targetType}{e.targetId ? ` ${e.targetId.slice(0, 10)}` : ""}</td>
            <td className="px-4 py-3 font-mono text-xs">{e.ip ?? "—"}</td>
          </tr>
        ))}
      </Table>
      <p className="mt-3 text-xs text-muted">Full history: <Link href="/admin/audit" className="text-primary">Audit log</Link>.</p>
    </>
  );
}
