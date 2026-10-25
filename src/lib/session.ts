import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "./auth";
import { can, isStaff, type Permission } from "./permissions";
import { prisma } from "./db";

/** One session lookup per request, however many components ask. */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  locale: string;
  displayCurrency: "HTG" | "USD";
  twoFactorEnabled?: boolean | null;
  emailVerified: boolean;
  /** Profile photo (from Google sign-in) */
  image?: string | null;
  /** Only for CUSTOM staff roles */
  permissions?: string[];
};

async function withPermissions(user: SessionUser): Promise<SessionUser> {
  if (user.role !== "CUSTOM") return user;
  const row = await prisma.user.findUnique({ where: { id: user.id }, include: { customRole: true } });
  return { ...user, permissions: row?.customRole?.permissions ?? [] };
}

export async function getUser(): Promise<SessionUser | null> {
  const s = await getSession();
  return (s?.user as unknown as SessionUser) ?? null;
}

/** Customer pages: redirect to login when signed out. */
export async function requireUser(locale: string, next?: string): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(`/${locale}/auth/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  if (user.status === "SUSPENDED" || user.status === "CLOSED") redirect(`/${locale}/auth/login?blocked=1`);
  return user;
}

export class AuthError extends Error {}

/** Server actions: throw when the caller is not signed in. */
export async function assertUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) throw new AuthError("Not signed in");
  if (user.status === "SUSPENDED" || user.status === "CLOSED") throw new AuthError("Account is not active");
  return user;
}

/** Admin pages: staff with 2FA enabled and the given permission. */
export async function requireStaff(permission: Permission = "dashboard.view"): Promise<SessionUser> {
  const base = await getUser();
  if (!base || !isStaff(base.role)) redirect("/admin/login");
  if (!base.twoFactorEnabled) redirect("/admin/setup-2fa");
  const user = await withPermissions(base);
  if (!can(user, permission)) redirect("/admin?denied=1");
  return user;
}

/** Admin server actions: throw instead of redirecting. */
export async function assertStaff(permission: Permission): Promise<SessionUser> {
  const base = await getUser();
  if (!base || !isStaff(base.role) || !base.twoFactorEnabled) throw new AuthError("Staff sign-in with 2FA required");
  const user = await withPermissions(base);
  if (!can(user, permission)) throw new AuthError(`Missing permission: ${permission}`);
  return user;
}

/** Require a fresh 2FA confirmation (last 10 minutes) for high-risk actions. */
export async function assertStepUp(): Promise<void> {
  const s = await getSession();
  if (!s) throw new AuthError("Not signed in");
  const row = await prisma.stepUp.findUnique({ where: { sessionToken: s.session.token } });
  if (!row || row.until < new Date() || row.userId !== s.user.id) throw new AuthError("STEP_UP_REQUIRED");
}
