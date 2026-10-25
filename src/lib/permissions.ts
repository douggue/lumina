import type { Role } from "@prisma/client";

export const PERMISSIONS = [
  "dashboard.view",
  "catalog.manage",
  "codes.manage",
  "codes.reveal",
  "orders.view",
  "orders.manage",
  "payments.review",
  "wallet.view",
  "wallet.adjust",
  "risk.manage",
  "customers.view",
  "customers.manage",
  "settings.manage",
  "staff.manage",
  "audit.view",
  "analytics.view",
  "support.manage",
  "content.manage",
  "seo.manage",
  "referrals.manage",
  "approvals.decide",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Starter roles from blueprint section 14. Enforced server-side in every admin action and page. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: PERMISSIONS,
  STORE_MANAGER: ["dashboard.view", "catalog.manage", "codes.manage", "orders.view", "orders.manage", "customers.view", "analytics.view", "content.manage"],
  FINANCE_MANAGER: ["dashboard.view", "payments.review", "wallet.view", "wallet.adjust", "risk.manage", "orders.view", "customers.view", "audit.view", "analytics.view", "referrals.manage", "approvals.decide"],
  CONTENT_EDITOR: ["dashboard.view", "catalog.manage", "content.manage", "seo.manage"],
  SUPPORT_AGENT: ["dashboard.view", "orders.view", "customers.view", "support.manage"],
  FULFILLMENT: ["dashboard.view", "orders.view", "orders.manage", "codes.reveal"],
  CUSTOM: [],
  CUSTOMER: [],
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  "dashboard.view": "See the admin dashboard",
  "catalog.manage": "Edit products, variants and categories",
  "codes.manage": "Import account / delivery codes",
  "codes.reveal": "Reveal delivered account codes (audited)",
  "orders.view": "View orders",
  "orders.manage": "Deliver, cancel and refund orders",
  "payments.review": "Approve or reject NatCash payments",
  "wallet.view": "View the ledger and balances",
  "wallet.adjust": "Adjust customer wallets",
  "risk.manage": "Resolve risk flags",
  "customers.view": "View customers",
  "customers.manage": "Restrict/suspend customers, create reset links",
  "settings.manage": "Change store settings and brand images",
  "staff.manage": "Manage staff, roles and 2FA resets",
  "audit.view": "View the audit log",
  "analytics.view": "View reports and export data",
  "support.manage": "Answer support tickets",
  "content.manage": "Edit homepage, news, theme and translations",
  "seo.manage": "Edit SEO titles and redirects",
  "referrals.manage": "Review referrals",
  "approvals.decide": "Approve large wallet adjustments (second person)",
};

type Subject = Role | string | undefined | null | { role: Role | string; permissions?: readonly string[] };

/** Built-in roles use ROLE_PERMISSIONS; CUSTOM roles carry their own `permissions` (loaded server-side). */
export function can(subject: Subject, permission: Permission): boolean {
  if (!subject) return false;
  if (typeof subject === "object") {
    if (subject.role === "CUSTOM") return permission === "dashboard.view" || (subject.permissions ?? []).includes(permission);
    return (ROLE_PERMISSIONS[subject.role as Role] ?? []).includes(permission);
  }
  return (ROLE_PERMISSIONS[subject as Role] ?? []).includes(permission);
}

export function isStaff(role: Role | string | undefined): boolean {
  return !!role && role !== "CUSTOMER" && role in ROLE_PERMISSIONS;
}
