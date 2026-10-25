"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertStaff, assertStepUp, getSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { deletePublicImage, isOwnImageUrl } from "@/lib/storage";
import { emailEnabled, sendEmailResult } from "@/lib/email";

type R = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): R => ({ ok: false, error: e instanceof Error ? e.message : "Unexpected error" });

// ───────────── Media library ─────────────

export type MediaItem = { id: string; url: string; folder: string; alt: string | null; createdAt: string };

async function assertMediaStaff() {
  const staff = await assertStaff("dashboard.view");
  if (!can(staff, "catalog.manage") && !can(staff, "content.manage") && !can(staff, "settings.manage")) throw new Error("Missing permission: catalog.manage");
  return staff;
}

/** Images already uploaded, newest first (used by the library picker in image fields). */
export async function listMedia(folder?: string): Promise<MediaItem[]> {
  await assertMediaStaff();
  const rows = await prisma.mediaAsset.findMany({ where: folder ? { folder } : {}, orderBy: { createdAt: "desc" }, take: 200 });
  return rows.map((r) => ({ id: r.id, url: r.url, folder: r.folder, alt: r.alt, createdAt: r.createdAt.toISOString() }));
}

export async function saveMediaAlt(id: string, alt: string): Promise<R> {
  try {
    await assertMediaStaff();
    await prisma.mediaAsset.update({ where: { id }, data: { alt: alt.trim().slice(0, 200) || null } });
    revalidatePath("/admin/media");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return fail(e);
  }
}

/** Where an image URL is still referenced. An image in use cannot be deleted. */
export async function mediaUsage(url: string): Promise<string[]> {
  const like = `%${url}%`;
  const [products, categories, news, methods, settings, pages] = await Promise.all([
    prisma.$queryRaw<{ slug: string }[]>`SELECT slug FROM "Product" WHERE image = ${url} OR gallery::text LIKE ${like}`,
    prisma.category.findMany({ where: { OR: [{ image: url }, { cover: url }] }, select: { slug: true } }),
    prisma.newsArticle.findMany({ where: { image: url }, select: { slug: true } }),
    prisma.manualMethod.findMany({ where: { OR: [{ logo: url }, { qrImage: url }] }, select: { name: true } }),
    prisma.$queryRaw<{ key: string }[]>`SELECT key FROM "SiteSetting" WHERE value::text LIKE ${like}`,
    prisma.$queryRaw<{ slug: string }[]>`SELECT slug FROM "Page" WHERE blocks::text LIKE ${like}`,
  ]);
  return [
    ...products.map((p) => `Product ${p.slug}`),
    ...categories.map((c) => `Category ${c.slug}`),
    ...news.map((n) => `News ${n.slug}`),
    ...methods.map((m) => `Payment method ${m.name}`),
    ...settings.map((s) => `Setting ${s.key}`),
    ...pages.map((p) => `Page ${p.slug}`),
  ];
}

export async function deleteMedia(id: string): Promise<R> {
  try {
    const staff = await assertMediaStaff();
    const asset = await prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) return { ok: false, error: "Not found" };
    const used = await mediaUsage(asset.url);
    if (used.length) return { ok: false, error: `Still used by: ${used.slice(0, 3).join(", ")}${used.length > 3 ? "…" : ""}` };
    await deletePublicImage(asset.url);
    await prisma.mediaAsset.delete({ where: { id } });
    await audit(staff.id, "image.delete", "MediaAsset", id, { url: asset.url });
    revalidatePath("/admin/media");
    return { ok: true, message: "Deleted" };
  } catch (e) {
    return fail(e);
  }
}

/** Add images that were uploaded before the library existed (products, categories, brand settings, news). */
export async function scanMedia(): Promise<R> {
  try {
    const staff = await assertMediaStaff();
    const [products, categories, news, settings] = await Promise.all([
      prisma.product.findMany({ select: { image: true, gallery: true } }),
      prisma.category.findMany({ select: { image: true, cover: true } }),
      prisma.newsArticle.findMany({ select: { image: true } }),
      prisma.siteSetting.findMany({ where: { key: { in: ["logoUrl", "logoDarkUrl", "heroImageUrl", "ogImageUrl"] } } }),
    ]);
    const found = new Map<string, string>();
    for (const p of products) [p.image, ...(Array.isArray(p.gallery) ? p.gallery : [])].forEach((u) => typeof u === "string" && u && found.set(u, "products"));
    for (const c of categories) for (const u of [c.image, c.cover]) if (u) found.set(u, "categories");
    for (const n of news) if (n.image) found.set(n.image, "products");
    for (const s of settings) if (typeof s.value === "string" && s.value) found.set(s.value, "brand");
    const rows = [...found].filter(([u]) => isOwnImageUrl(u)).map(([url, folder]) => ({ url, folder, uploadedBy: staff.id }));
    const r = await prisma.mediaAsset.createMany({ data: rows, skipDuplicates: true });
    revalidatePath("/admin/media");
    return { ok: true, message: `${r.count} image(s) added` };
  } catch (e) {
    return fail(e);
  }
}

// ───────────── Staff sessions ─────────────

export async function revokeSession(sessionId: string): Promise<R> {
  try {
    const staff = await assertStaff("staff.manage");
    await assertStepUp();
    const current = await getSession();
    const s = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!s) return { ok: false, error: "Session already ended" };
    if (current?.session.id === sessionId) return { ok: false, error: "This is your current session — sign out instead" };
    await prisma.session.delete({ where: { id: sessionId } });
    await audit(staff.id, "session.revoke", "User", s.userId, { ip: s.ipAddress });
    revalidatePath("/admin/security");
    return { ok: true, message: "Signed out" };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeAllSessions(userId: string): Promise<R> {
  try {
    const staff = await assertStaff("staff.manage");
    await assertStepUp();
    const current = await getSession();
    const r = await prisma.session.deleteMany({ where: { userId, NOT: { id: current?.session.id ?? "" } } });
    await audit(staff.id, "session.revoke_all", "User", userId, { count: r.count });
    revalidatePath("/admin/security");
    return { ok: true, message: `${r.count} session(s) signed out` };
  } catch (e) {
    return fail(e);
  }
}

// ───────────── Email ─────────────

export async function sendTestEmail(to: string): Promise<R> {
  try {
    const staff = await assertStaff("settings.manage");
    const addr = to.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return { ok: false, error: "Enter a valid email address" };
    if (!emailEnabled()) return { ok: false, error: "Email is off: set RESEND_API_KEY and EMAIL_FROM in Vercel, then redeploy" };
    const { ok, error } = await sendEmailResult({
      to: addr,
      subject: "HaitiViral test email",
      html: "<p>This is a test from the HaitiViral admin. Email delivery works.</p>",
      text: "This is a test from the HaitiViral admin. Email delivery works.",
    });
    await audit(staff.id, "email.test", "EmailLog", null, { to: addr, ok });
    revalidatePath("/admin/email");
    return ok ? { ok: true, message: "Sent — check the inbox" } : { ok: false, error: error ?? "Resend refused the message (see the log below)" };
  } catch (e) {
    return fail(e);
  }
}
