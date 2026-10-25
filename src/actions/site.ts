"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertStaff } from "@/lib/session";
import { audit } from "@/lib/audit";
import { setSetting, type NavLink } from "@/lib/settings";
import { blocksSchema } from "@/lib/pages";
import { isOwnImageUrl } from "@/lib/storage";
import { randomToken } from "@/lib/crypto";

type R = { ok: true; message?: string; id?: string } | { ok: false; error: string };
const fail = (e: unknown): R => ({ ok: false, error: e instanceof Error ? e.message : "Unexpected error" });
const LOCALES = ["ht", "fr"];
const cleanL = (v: unknown, max = 200) => Object.fromEntries(LOCALES.map((l) => [l, String((v as Record<string, string>)?.[l] ?? "").trim().slice(0, max)]));

// ───────────── Custom pages ─────────────

export async function savePage(input: { id?: string; slug: string; title: Record<string, string>; description: Record<string, string>; blocks: unknown; isPublished: boolean; showInFooter: boolean }): Promise<R> {
  try {
    const staff = await assertStaff("content.manage");
    const slug = input.slug.trim().toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return { ok: false, error: "Slug must be lowercase letters, numbers and dashes" };
    const parsed = blocksSchema.safeParse(input.blocks);
    if (!parsed.success) return { ok: false, error: "Some blocks are incomplete" };
    for (const b of parsed.data) {
      if (b.type === "image" && b.url && !isOwnImageUrl(b.url)) return { ok: false, error: "Use images uploaded here" };
      if (b.type === "button" && !(b.href.startsWith("/") || b.href.startsWith("https://"))) return { ok: false, error: "Button links must start with / or https://" };
    }
    const title = cleanL(input.title, 120);
    if (!title.ht && !title.fr) return { ok: false, error: "Title in Kreyòl or French is required" };
    const data = { slug, title, description: cleanL(input.description, 170), blocks: parsed.data as Prisma.InputJsonValue, isPublished: !!input.isPublished, showInFooter: !!input.showInFooter };
    const page = input.id ? await prisma.page.update({ where: { id: input.id }, data }) : await prisma.page.create({ data });
    await audit(staff.id, input.id ? "page.update" : "page.create", "Page", page.id, { slug });
    revalidatePath("/", "layout");
    revalidateTag("pages");
    return { ok: true, id: page.id, message: "Saved" };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "That slug is already used" };
    return fail(e);
  }
}

export async function deletePage(id: string): Promise<R> {
  try {
    const staff = await assertStaff("content.manage");
    await prisma.page.delete({ where: { id } });
    await audit(staff.id, "page.delete", "Page", id);
    revalidatePath("/", "layout");
    revalidateTag("pages");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ───────────── Navigation ─────────────

export async function saveNavigation(nav: { header: NavLink[]; footer: NavLink[] }): Promise<R> {
  try {
    const staff = await assertStaff("content.manage");
    const clean = (list: NavLink[]) =>
      (list ?? []).slice(0, 12).map((l) => ({ label: cleanL(l.label, 40), href: String(l.href ?? "").trim() })).filter((l) => l.href && (l.label.ht || l.label.fr || l.label.en));
    const header = clean(nav.header);
    const footer = clean(nav.footer);
    for (const l of [...header, ...footer]) if (!(l.href.startsWith("/") || l.href.startsWith("https://"))) return { ok: false, error: `Link "${l.href}" must start with / or https://` };
    await setSetting("navigation", { header, footer });
    await audit(staff.id, "navigation.save", "SiteSetting", "navigation", { header: header.length, footer: footer.length });
    revalidatePath("/", "layout");
    return { ok: true, message: "Navigation published" };
  } catch (e) {
    return fail(e);
  }
}

// ───────────── Newsletter (public) ─────────────

export async function subscribeNewsletter(email: string, locale: string, captcha?: string): Promise<R> {
  const { verifyTurnstile } = await import("@/lib/turnstile");
  const { headers } = await import("next/headers");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!(await verifyTurnstile(captcha, ip))) return { ok: false, error: "captcha" };
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) return { ok: false, error: "invalid" };
  const l = LOCALES.includes(locale) ? locale : "ht";
  await prisma.newsletterSubscriber.upsert({
    where: { email: e },
    create: { email: e, locale: l, token: randomToken(18) },
    update: { unsubscribedAt: null, consentAt: new Date(), locale: l },
  });
  return { ok: true };
}

// ───────────── Manual payment methods ─────────────

/** Changing where customers send money is high-risk: requires a fresh 2FA confirmation. */
export async function saveManualMethod(form: FormData): Promise<R> {
  try {
    const staff = await assertStaff("settings.manage");
    const { assertStepUp } = await import("@/lib/session");
    await assertStepUp();
    const id = String(form.get("id") ?? "") || null;
    const code = String(form.get("code") ?? "").trim().toLowerCase();
    if (!/^[a-z0-9-]{2,30}$/.test(code)) return { ok: false, error: "Code: 2–30 lowercase letters, numbers or dashes" };
    const L = (prefix: string, max: number) => Object.fromEntries(LOCALES.map((l) => [l, String(form.get(`${prefix}_${l}`) ?? "").trim().slice(0, max)]));
    const name = L("name", 40);
    if (!name.ht && !name.fr) return { ok: false, error: "Give the method a name" };
    const recipientName = String(form.get("recipientName") ?? "").trim().slice(0, 80);
    const recipientNumber = String(form.get("recipientNumber") ?? "").trim().slice(0, 60);
    if (!recipientName || !recipientNumber) return { ok: false, error: "Recipient name and number/account are required" };
    const logo = String(form.get("logo") ?? "").trim();
    if (logo && !isOwnImageUrl(logo)) return { ok: false, error: "Invalid logo" };
    const qrImage = String(form.get("qrImage") ?? "").trim();
    if (qrImage && !isOwnImageUrl(qrImage)) return { ok: false, error: "Invalid QR image" };
    const kind = form.get("kind") === "crypto" ? "crypto" : "mobile";
    const network = kind === "crypto" ? String(form.get("network") ?? "").trim().slice(0, 40) : null;
    if (kind === "crypto") {
      if (!network) return { ok: false, error: "Crypto: say which network, e.g. BEP-20 (BSC)" };
      // EVM (BSC, Polygon, Ethereum) or Tron address: a typo here would send customers' money to nobody.
      if (!/^0x[0-9a-fA-F]{40}$/.test(recipientNumber) && !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(recipientNumber))
        return { ok: false, error: "Crypto: that does not look like a wallet address (0x… with 42 characters, or T… for Tron)" };
    }
    const data = {
      code, name, instructions: L("instructions", 600), recipientName, recipientNumber, logo: logo || null,
      kind, network, qrImage: qrImage || null, currency: kind === "crypto" ? ("USD" as const) : ("HTG" as const),
      // Crypto credits the USD wallet only; orders are paid from the wallet afterwards.
      isEnabled: form.get("isEnabled") === "on", allowDeposits: form.get("allowDeposits") === "on", allowOrders: kind === "crypto" ? false : form.get("allowOrders") === "on",
      sortOrder: Number(form.get("sortOrder") ?? 0) || 0,
    };
    const m = id ? await prisma.manualMethod.update({ where: { id }, data }) : await prisma.manualMethod.create({ data });
    await audit(staff.id, id ? "payment_method.update" : "payment_method.create", "ManualMethod", m.id, { code, kind, network, recipientNumber, isEnabled: data.isEnabled });
    revalidatePath("/admin/payment-methods");
    return { ok: true, message: "Saved" };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "That code is already used" };
    return fail(e);
  }
}
