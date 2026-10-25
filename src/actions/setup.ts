"use server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { seedDemoCatalog } from "@/lib/demo-catalog";

/** True until the first staff account exists. After that, /admin/setup is closed for good. */
export async function setupOpen(): Promise<boolean> {
  return (await prisma.user.count({ where: { role: { not: "CUSTOMER" } } })) === 0;
}

function codeMatches(input: string): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const a = Buffer.from(input.trim());
  const b = Buffer.from(secret);
  return secret.length >= 16 && a.length === b.length && timingSafeEqual(a, b);
}

/**
 * First-run setup from the browser (no computer or terminal needed):
 * creates the Super Admin and optionally loads the demo catalog.
 * Protected by the CRON_SECRET value set in Vercel, and only works while no staff account exists.
 */
export async function runFirstSetup(form: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!(await setupOpen())) return { ok: false, error: "Setup is already done. Sign in instead." };
    if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 16) return { ok: false, error: "Add CRON_SECRET in Vercel (Settings → Environment Variables), redeploy, then try again." };
    if (!codeMatches(String(form.get("code") ?? ""))) {
      await new Promise((r) => setTimeout(r, 1500)); // slow down guessing
      return { ok: false, error: "The setup code doesn't match CRON_SECRET." };
    }
    const name = String(form.get("name") ?? "").trim().slice(0, 80);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter your name and a valid email." };
    if (password.length < 12) return { ok: false, error: "Use a password of at least 12 characters." };

    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      try {
        await auth.api.signUpEmail({ body: { email, password, name } });
      } catch (e) {
        const code = (e as { body?: { code?: string } }).body?.code;
        return { ok: false, error: code === "PASSWORD_COMPROMISED" ? "That password appeared in a data breach. Choose another one." : "Could not create the account." };
      }
    }
    await prisma.user.update({ where: { email }, data: { role: "SUPER_ADMIN", status: "ACTIVE" } });
    await prisma.auditEvent.create({ data: { action: "staff.bootstrap", targetType: "User", metadata: { email, via: "web" } } });
    if (form.get("demo") === "on") await seedDemoCatalog(prisma);
    return { ok: true };
  } catch (e) {
    console.error("first setup failed", e);
    return { ok: false, error: e instanceof Error && e.message.includes("ENCRYPTION_KEY") ? "ENCRYPTION_KEY is missing or wrong in Vercel." : "Setup failed. Check the Vercel logs." };
  }
}
