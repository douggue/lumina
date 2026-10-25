import "server-only";
import { prisma } from "./db";
import { emailEnabled } from "./email";
import { getSettings } from "./settings";

/**
 * The lock is on only when the owner wants it (Admin → Settings) AND email can actually be sent:
 * if email stops working, nobody gets stuck. Staff accounts are never locked.
 */
export function verificationRequired(flag: boolean, emailOn: boolean, user: { role: string; emailVerified: boolean }) {
  return flag && emailOn && user.role === "CUSTOMER" && !user.emailVerified;
}

/** Reads the account from the database: the session can lag a moment behind a link just clicked. */
export async function mustVerifyEmail(userId: string): Promise<boolean> {
  const [settings, user] = await Promise.all([
    getSettings(),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true, emailVerified: true } }),
  ]);
  if (!user) return false;
  return verificationRequired(settings.requireEmailVerification, emailEnabled(), user);
}
