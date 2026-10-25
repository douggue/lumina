"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertStaff } from "@/lib/session";
import { audit } from "@/lib/audit";
import { setSetting } from "@/lib/settings";
import { isCity } from "@/lib/cities";

type R = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): R => ({ ok: false, error: e instanceof Error ? e.message : "Unexpected error" });

const done = (message?: string): R => {
  revalidatePath("/admin/trust");
  revalidatePath("/", "layout");
  return { ok: true, message };
};

/** "Jean" + "Pierre" / "P." → "Jean P." */
function feedName(first: string, last: string) {
  const f = first.trim().split(/\s+/)[0]?.slice(0, 24) ?? "";
  const l = last.trim().replace(/[^\p{L}]/gu, "")[0]?.toUpperCase() ?? "";
  return f ? (l ? `${f} ${l}.` : f) : "";
}

// ───────────── Sale popup feed ─────────────

/** A real sale made outside the site (WhatsApp…), added to the popup feed. */
export async function addFeedSale(form: FormData): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    const name = feedName(String(form.get("first") ?? ""), String(form.get("last") ?? ""));
    const city = form.get("city");
    const productId = String(form.get("productId") ?? "");
    const day = String(form.get("soldOn") ?? "");
    if (!name) return { ok: false, error: "First name required" };
    if (!isCity(city)) return { ok: false, error: "Pick a city" };
    if (!(await prisma.product.findUnique({ where: { id: productId }, select: { id: true } }))) return { ok: false, error: "Pick a product" };
    const soldAt = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T12:00:00`) : new Date();
    if (soldAt.getTime() > Date.now() + 86_400_000) return { ok: false, error: "The date can't be in the future" };
    const item = await prisma.saleFeedItem.create({ data: { name, city, productId, soldAt, createdBy: staff.id } });
    await audit(staff.id, "feed.add", "SaleFeedItem", item.id, { name, city, productId });
    return done(`Added: ${name} · ${city}`);
  } catch (e) {
    return fail(e);
  }
}

export async function deleteFeedSale(id: string): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    await prisma.saleFeedItem.delete({ where: { id } });
    await audit(staff.id, "feed.delete", "SaleFeedItem", id, {});
    return done("Removed");
  } catch (e) {
    return fail(e);
  }
}

/** Popup on/off, popups per visit, low stock limit, and which products show the popup. */
export async function saveTrustSettings(form: FormData): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    const perVisit = Math.min(5, Math.max(1, Math.round(Number(form.get("perVisit")) || 3)));
    const limit = Math.min(100, Math.max(1, Math.round(Number(form.get("lowLimit")) || 5)));
    const enabled = form.get("enabled") === "on";
    const popup = new Set(form.getAll("popup").map(String));
    await setSetting("salesPopupEnabled", enabled);
    await setSetting("salesPopupPerVisit", perVisit);
    await setSetting("lowStockLimit", limit);
    await prisma.$transaction([
      prisma.product.updateMany({ where: { id: { in: [...popup] } }, data: { salesPopup: true } }),
      prisma.product.updateMany({ where: { id: { notIn: [...popup] } }, data: { salesPopup: false } }),
    ]);
    await audit(staff.id, "trust.settings", "SiteSetting", null, { enabled, perVisit, limit, popupProducts: popup.size });
    return done("Saved");
  } catch (e) {
    return fail(e);
  }
}

// ───────────── Reviews ─────────────

/** A real comment a customer sent (WhatsApp…) with their permission, typed in by staff. Approved right away. */
export async function addReview(form: FormData): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    const name = feedName(String(form.get("first") ?? ""), String(form.get("last") ?? ""));
    const rating = Math.round(Number(form.get("rating")));
    const quote = String(form.get("quote") ?? "").trim().slice(0, 400);
    const city = form.get("city");
    const productId = String(form.get("productId") ?? "") || null;
    if (!name) return { ok: false, error: "First name required" };
    if (!(rating >= 1 && rating <= 5)) return { ok: false, error: "Rating 1 to 5" };
    if (quote.length < 5) return { ok: false, error: "Write the customer's comment" };
    const r = await prisma.review.create({
      data: { name, rating, quote, city: isCity(city) ? city : null, productId, source: "admin", status: "approved", onHome: form.get("onHome") === "on" },
    });
    await audit(staff.id, "review.add", "Review", r.id, { name });
    return done("Review added");
  } catch (e) {
    return fail(e);
  }
}

export async function updateReview(id: string, patch: { status?: "approved" | "hidden"; onHome?: boolean }): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    const data = { ...patch, ...(patch.status === "hidden" ? { onHome: false } : {}), ...(patch.onHome ? { status: "approved" } : {}) };
    await prisma.review.update({ where: { id }, data });
    await audit(staff.id, "review.update", "Review", id, data);
    return done();
  } catch (e) {
    return fail(e);
  }
}

export async function deleteReview(id: string): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    await prisma.review.delete({ where: { id } });
    await audit(staff.id, "review.delete", "Review", id, {});
    return done("Deleted");
  } catch (e) {
    return fail(e);
  }
}

// ───────────── Low stock ─────────────

/** Per option: off | auto (code products: shows when codes left ≤ limit) | on (manual, optional number of days). */
export async function setLowStock(variantId: string, form: FormData): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    const mode = String(form.get("mode"));
    if (!["off", "auto", "on"].includes(mode)) return { ok: false, error: "Unknown mode" };
    const v = await prisma.productVariant.findUnique({ where: { id: variantId }, select: { product: { select: { fulfillmentType: true } } } });
    if (!v) return { ok: false, error: "Option not found" };
    if (mode === "auto" && v.product.fulfillmentType !== "CODE_INVENTORY") return { ok: false, error: "Automatic only works for products delivered with codes" };
    const days = Math.round(Number(form.get("days")));
    const until = mode === "on" && days > 0 ? new Date(Date.now() + Math.min(days, 60) * 86_400_000) : null;
    await prisma.productVariant.update({ where: { id: variantId }, data: { lowStock: mode, lowStockUntil: until } });
    await audit(staff.id, "variant.lowStock", "ProductVariant", variantId, { mode, until });
    return done("Saved");
  } catch (e) {
    return fail(e);
  }
}
