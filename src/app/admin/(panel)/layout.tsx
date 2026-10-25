import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { can, type Permission } from "@/lib/permissions";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const [reviews, risks, processing, approvals, tickets, newReviews, supplierIssues] = await Promise.all([
    prisma.paymentIntent.count({ where: { status: "REVIEW" } }),
    prisma.riskFlag.count({ where: { status: "OPEN" } }),
    prisma.order.count({ where: { status: "PROCESSING" } }),
    prisma.pendingApproval.count({ where: { status: "PENDING" } }),
    prisma.supportTicket.count({ where: { status: "OPEN" } }),
    prisma.review.count({ where: { status: "pending" } }),
    // Supplier orders staff must look at: failed, or no longer checked automatically
    // (a failed attempt only counts while its line is still undelivered and not refunded)
    prisma.supplierOrder.count({ where: { OR: [{ status: "FAILED", orderItem: { status: "PENDING", order: { status: { in: ["PAID", "PROCESSING"] } } } }, { status: { in: ["PENDING", "UNKNOWN"] }, nextCheckAt: null }] } }),
  ]);
  const all: { href: string; label: string; group: string; perm: Permission; badge?: number }[] = [
    { href: "/admin", label: "Dashboard", group: "", perm: "dashboard.view" },
    { href: "/admin/orders", label: "Orders", group: "Operations", perm: "orders.view", badge: processing },
    { href: "/admin/payments", label: "Payments", group: "Operations", perm: "payments.review", badge: reviews },
    { href: "/admin/reconciliation", label: "Reconciliation", group: "Operations", perm: "payments.review" },
    { href: "/admin/risk", label: "Risk queue", group: "Operations", perm: "risk.manage", badge: risks },
    { href: "/admin/approvals", label: "Approvals", group: "Operations", perm: "approvals.decide", badge: approvals },
    { href: "/admin/support", label: "Support", group: "Operations", perm: "support.manage", badge: tickets },
    { href: "/admin/services", label: "Services & risk", group: "Catalog", perm: "catalog.manage" },
    { href: "/admin/pricing", label: "Pricing & profit", group: "Catalog", perm: "settings.manage" },
    { href: "/admin/suppliers", label: "Providers", group: "Catalog", perm: "settings.manage", badge: supplierIssues },
    { href: "/admin/products", label: "Catalog editor", group: "Catalog", perm: "catalog.manage" },
    { href: "/admin/codes", label: "Accounts stock", group: "Catalog", perm: "codes.manage" },
    { href: "/admin/media", label: "Media", group: "Catalog", perm: "catalog.manage" },
    { href: "/admin/trust", label: "Reviews", group: "Catalog", perm: "catalog.manage", badge: newReviews },
    { href: "/admin/customers", label: "Customers", group: "Customers", perm: "customers.view" },
    { href: "/admin/wallet", label: "Ledger", group: "Customers", perm: "wallet.view" },
    { href: "/admin/referrals", label: "Referrals", group: "Customers", perm: "referrals.manage" },
    { href: "/admin/trials", label: "Free trials", group: "Customers", perm: "orders.view" },
    { href: "/admin/analytics", label: "Reports", group: "Customers", perm: "analytics.view" },
    { href: "/admin/homepage", label: "Homepage", group: "Content", perm: "content.manage" },
    { href: "/admin/news", label: "Updates", group: "Content", perm: "content.manage" },
    { href: "/admin/pages", label: "Pages", group: "Content", perm: "content.manage" },
    { href: "/admin/navigation", label: "Menus", group: "Content", perm: "content.manage" },
    { href: "/admin/newsletter", label: "Newsletter", group: "Content", perm: "content.manage" },
    { href: "/admin/appearance", label: "Appearance", group: "Content", perm: "content.manage" },
    { href: "/admin/translations", label: "Translations", group: "Content", perm: "content.manage" },
    { href: "/admin/seo", label: "SEO", group: "Content", perm: "seo.manage" },
    { href: "/admin/staff", label: "Staff & roles", group: "Settings", perm: "staff.manage" },
    { href: "/admin/security", label: "Security", group: "Settings", perm: "staff.manage" },
    { href: "/admin/payment-methods", label: "Payment methods", group: "Settings", perm: "settings.manage" },
    { href: "/admin/email", label: "Email", group: "Settings", perm: "settings.manage" },
    { href: "/admin/settings", label: "Settings", group: "Settings", perm: "settings.manage" },
    { href: "/admin/audit", label: "Audit log", group: "Settings", perm: "audit.view" },
  ];
  return (
    <div className="lg:flex">
      <AdminNav items={all.filter((i) => can(user, i.perm))} user={{ name: user.name, role: user.role }}/>
      <main className="admin-main min-w-0 flex-1 p-4 pb-28 sm:p-6 sm:pb-28 lg:p-8">{children}</main>
    </div>
  );
}
