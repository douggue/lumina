import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { PERMISSION_LABELS, PERMISSIONS, ROLE_PERMISSIONS } from "@/lib/permissions";
import { deleteCustomRole, resetStaffTwoFactor, saveCustomRole, setStaffRole } from "@/actions/admin";
import { ActionButton, ActionForm } from "@/components/admin/ActionButton";
import { PageTitle, Table } from "@/components/admin/ui";
import type { Role } from "@prisma/client";

export const metadata = { title: "Staff & roles" };

const BUILT_IN = (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((r) => r !== "CUSTOM");

function PermissionBoxes({ selected = [] }: { selected?: string[] }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {PERMISSIONS.filter((p) => p !== "staff.manage" && p !== "dashboard.view").map((p) => (
        <label key={p} className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="permissions" value={p} defaultChecked={selected.includes(p)} className="mt-1" />
          <span>{PERMISSION_LABELS[p]}</span>
        </label>
      ))}
    </div>
  );
}

export default async function StaffPage() {
  const me = await requireStaff("staff.manage");
  const [staff, customRoles] = await Promise.all([
    prisma.user.findMany({ where: { role: { not: "CUSTOMER" } }, orderBy: { name: "asc" }, include: { customRole: true } }),
    prisma.customRole.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { users: true } } } }),
  ]);
  const assign = async (fd: FormData) => {
    "use server";
    return setStaffRole(String(fd.get("email")), String(fd.get("role")));
  };
  return (
    <>
      <PageTitle title="Staff & roles" sub="Staff register a normal account first, then you assign a role here. Two-factor authentication is mandatory for every staff role. Role changes ask you to re-confirm with your code." />
      <ActionForm action={assign} className="card mb-6 flex flex-wrap items-end gap-3 p-5" resetOnSuccess>
        <label className="flex-1"><span className="label">Account email</span><input name="email" type="email" required className="input" /></label>
        <label><span className="label">Role</span>
          <select name="role" className="input">
            {BUILT_IN.map((r) => <option key={r} value={r}>{r === "CUSTOMER" ? "CUSTOMER (remove staff access)" : r}</option>)}
            {customRoles.map((r) => <option key={r.id} value={`CUSTOM:${r.id}`}>Custom: {r.name}</option>)}
          </select>
        </label>
        <button className="btn-primary">Assign role</button>
      </ActionForm>
      <Table head={["Name", "Email", "Role", "2FA", ""]}>
        {staff.map((s) => (
          <tr key={s.id}>
            <td className="px-4 py-3 font-medium">{s.name}</td>
            <td className="px-4 py-3">{s.email}</td>
            <td className="px-4 py-3 text-xs">{s.role === "CUSTOM" ? `Custom: ${s.customRole?.name ?? "?"}` : s.role}</td>
            <td className="px-4 py-3">{s.twoFactorEnabled ? <span className="text-success">On</span> : <span className="text-warning">Pending</span>}</td>
            <td className="px-4 py-3">{s.id !== me.id && s.twoFactorEnabled && <ActionButton label="Reset 2FA" confirm={`Reset two-factor for ${s.name}? Use this only if they lost their phone and you've confirmed it's them.`} action={resetStaffTwoFactor.bind(null, s.id)} />}</td>
          </tr>
        ))}
      </Table>

      <h2 className="mb-3 mt-10 text-lg font-semibold">Custom roles</h2>
      <p className="mb-4 text-sm text-muted">Build roles with exactly the permissions a person needs. Managing staff stays with Super Admins.</p>
      <div className="grid gap-4 xl:grid-cols-2">
        {customRoles.map((r) => (
          <ActionForm key={r.id} action={saveCustomRole} className="card space-y-3 p-5">
            <input type="hidden" name="id" value={r.id} />
            <div className="flex items-end gap-2">
              <label className="flex-1"><span className="label">Role name</span><input name="name" defaultValue={r.name} className="input" /></label>
              <span className="pb-3 text-xs text-muted">{r._count.users} staff</span>
            </div>
            <PermissionBoxes selected={r.permissions} />
            <div className="flex items-center gap-2">
              <button className="btn-primary min-h-9 px-4 text-xs">Save role</button>
              {r._count.users === 0 && <ActionButton label="Delete" className="btn-ghost min-h-9 px-3 text-xs text-danger" confirm={`Delete role ${r.name}?`} action={deleteCustomRole.bind(null, r.id)} />}
            </div>
          </ActionForm>
        ))}
        <ActionForm action={saveCustomRole} className="card space-y-3 border-dashed p-5" resetOnSuccess>
          <label className="block"><span className="label">New role name</span><input name="name" placeholder="e.g. Night shift fulfillment" className="input" required /></label>
          <PermissionBoxes />
          <button className="btn-primary min-h-9 px-4 text-xs">Create role</button>
        </ActionForm>
      </div>

      <h2 className="mb-3 mt-10 font-semibold">Built-in roles</h2>
      <Table head={["Role", "Permissions"]}>
        {BUILT_IN.filter((r) => r !== "CUSTOMER").map((r) => <tr key={r}><td className="px-4 py-3 text-xs font-semibold">{r}</td><td className="px-4 py-3 text-xs text-muted">{ROLE_PERMISSIONS[r].map((p) => PERMISSION_LABELS[p]).join(" · ")}</td></tr>)}
      </Table>
    </>
  );
}
