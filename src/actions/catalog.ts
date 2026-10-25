"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertStaff } from "@/lib/session";
import { audit } from "@/lib/audit";
import { getSettings, setSetting } from "@/lib/settings";
import { parseMeta } from "@/lib/services";
import { rulesFromText } from "@/lib/service-risk";
import { cleanInfo } from "@/lib/service-info";
import { syncPackPrices } from "@/lib/packs";
import { runSupplierCron } from "@/lib/suppliers/orders";
import { candidatesFor, candidatesForSpec, createServiceFromProviders, pickProviderService, type Candidate, postServiceUpdate, applyProfitRules, applyRisk, linkChoice, setChoiceRisk, syncAllProviders, syncProviderServices } from "@/lib/suppliers/catalog";

type R = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): R => ({ ok: false, error: e instanceof Error ? e.message : "Unexpected error" });
const refresh = () => ["/admin/services", "/admin/pricing", "/admin/suppliers", "/admin"].forEach((p) => revalidatePath(p));

/** "Sync from providers": one provider, or all SMM providers (then risk and profit are checked again). */
export async function syncProvidersAction(supplierId: string | null): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    if (supplierId) {
      const r = await syncProviderServices(supplierId);
      await applyRisk();
      await applyProfitRules();
      await audit(staff.id, "provider.sync", "Supplier", supplierId, r);
      refresh();
      return { ok: true, message: `${r.total} services · ${r.added} new · ${r.updated} changed · ${r.removed} gone` };
    }
    const r = await syncAllProviders();
    await audit(staff.id, "provider.sync", "Supplier", "all", r as Record<string, unknown>);
    refresh();
    const parts = Object.entries(r).map(([name, v]) => `${name}: ${"error" in (v as object) ? (v as { error: string }).error : `${(v as { total: number }).total} services`}`);
    return { ok: true, message: parts.join(" · ") || "No SMM provider yet: add one in Suppliers" };
  } catch (e) {
    return fail(e);
  }
}

export async function reanalyzeAction(): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    const n = await applyRisk();
    await audit(staff.id, "risk.reanalyze", "ProductVariant", "all", { changed: n });
    refresh();
    return { ok: true, message: n ? `${n} level(s) updated` : "Nothing changed" };
  } catch (e) {
    return fail(e);
  }
}

export async function setRiskAction(variantId: string, form: FormData): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    const level = String(form.get("level") ?? "auto");
    if (!["auto", "low", "med", "high", "blocked"].includes(level)) return { ok: false, error: "Unknown level" };
    await setChoiceRisk(variantId, level as "auto");
    await audit(staff.id, "risk.set", "ProductVariant", variantId, { level });
    refresh();
    return { ok: true, message: level === "auto" ? "Uses the suggestion" : "Saved and locked" };
  } catch (e) {
    return fail(e);
  }
}

export async function saveRiskRules(form: FormData): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    const rules = rulesFromText(String(form.get("rules") ?? ""));
    if (!rules.length) return { ok: false, error: 'Write at least one rule, like "+3 bot, fake"' };
    const blocked = String(form.get("blocked") ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
    await setSetting("riskRules", rules);
    await setSetting("riskBlocked", blocked);
    const n = await applyRisk();
    await audit(staff.id, "risk.rules", "SiteSetting", "riskRules", { rules: rules.length, blocked: blocked.length });
    refresh();
    return { ok: true, message: `Saved · ${n} level(s) updated` };
  } catch (e) {
    return fail(e);
  }
}

export async function linkChoiceAction(variantId: string, form: FormData): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    const input = {
      supplierId: String(form.get("supplierId") ?? "") || null,
      sku: String(form.get("sku") ?? ""),
      backupSupplierId: String(form.get("backupSupplierId") ?? "") || null,
      backupSku: String(form.get("backupSku") ?? ""),
    };
    const main = await linkChoice(variantId, input);
    await applyRisk();
    await applyProfitRules();
    await audit(staff.id, "choice.link", "ProductVariant", variantId, input);
    refresh();
    return { ok: true, message: main ? `Linked to ${main.name}` : "Unlinked" };
  } catch (e) {
    return fail(e);
  }
}

export async function savePricing(form: FormData): Promise<R> {
  try {
    const staff = await assertStaff("settings.manage");
    const num = (k: string, min: number, max: number) => {
      const v = Number(String(form.get(k) ?? "").replace(",", "."));
      if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${k}: must be between ${min} and ${max}`);
      return v;
    };
    const values = { htgPerUsd: num("htgPerUsd", 1, 10_000), paymentFeePct: num("paymentFeePct", 0, 50), minProfitPct: num("minProfitPct", 0, 95), targetProfitPct: num("targetProfitPct", 0, 90), autoPauseLoss: form.get("autoPauseLoss") === "on" };
    for (const [k, v] of Object.entries(values)) await setSetting(k as "htgPerUsd", v as number);
    const r = await applyProfitRules();
    await audit(staff.id, "pricing.save", "SiteSetting", "pricing", values);
    refresh();
    return { ok: true, message: `Saved${r.paused ? ` · ${r.paused} paused (loss)` : ""}${r.resumed ? ` · ${r.resumed} back on` : ""}` };
  } catch (e) {
    return fail(e);
  }
}

/** Selling price per 1,000 for one choice, from the pricing table (in gourdes). */
export async function setChoicePrice(variantId: string, gourdes: string): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    const v = Math.round(Number(gourdes.replace(/[^\d.]/g, "")) * 100);
    if (!Number.isFinite(v) || v <= 0) return { ok: false, error: "Write a price in gourdes, like 420" };
    const before = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId }, select: { priceHtg: true } });
    await prisma.productVariant.update({ where: { id: variantId }, data: { priceHtg: v } });
    if (v !== before.priceHtg) await postServiceUpdate(v > before.priceHtg ? "price_up" : "price_down", variantId, v);
    await syncPackPrices();
    const r = await applyProfitRules();
    await audit(staff.id, "choice.price", "ProductVariant", variantId, { from: before.priceHtg, to: v });
    refresh();
    return { ok: true, message: `${(v / 100).toLocaleString("en-US")} HTG${r.resumed ? " · back on" : r.paused ? " · paused (loss)" : ""}` };
  } catch (e) {
    return fail(e);
  }
}

/** Services status shown to customers per platform: normal, slow, or paused (paused = no new orders). */
export async function saveServiceStatus(form: FormData): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    const s = await getSettings();
    const next: Record<string, "ok" | "slow" | "pause"> = { ...s.serviceStatus };
    for (const [k, v] of form.entries()) {
      if (!k.startsWith("status_")) continue;
      const val = String(v);
      if (val === "ok") delete next[k.slice(7)];
      else if (val === "slow" || val === "pause") next[k.slice(7)] = val;
    }
    await setSetting("serviceStatus", next);
    await audit(staff.id, "services.status", "SiteSetting", "serviceStatus", next);
    refresh();
    return { ok: true, message: "Saved" };
  } catch (e) {
    return fail(e);
  }
}

/** Dashboard "Check orders now": send what's waiting and ask the providers about every order that's due. */
export async function checkOrdersNow(): Promise<R> {
  try {
    const staff = await assertStaff("orders.manage");
    await prisma.supplierOrder.updateMany({ where: { status: "PENDING", nextCheckAt: { not: null } }, data: { nextCheckAt: new Date() } });
    const r = await runSupplierCron();
    await audit(staff.id, "orders.check", "SupplierOrder", "all", r);
    refresh();
    return { ok: true, message: `${r.supplierDelivered} delivered` };
  } catch (e) {
    return fail(e);
  }
}

/** Starter pack contents (Pricing page): up to 5 rows of choice + quantity. */
export async function savePackItems(variantId: string, form: FormData): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId }, include: { product: { include: { category: true } } } });
    if (v.product.category.slug !== "pake") return { ok: false, error: "Not a pack" };
    const items: { variantId: string; quantity: number }[] = [];
    for (let i = 0; i < 5; i++) {
      const id = String(form.get(`v${i}`) ?? "");
      const q = Number(String(form.get(`q${i}`) ?? "").replace(/[^\d]/g, ""));
      if (!id) continue;
      if (!Number.isInteger(q) || q <= 0) return { ok: false, error: `Row ${i + 1}: write a quantity` };
      items.push({ variantId: id, quantity: q });
    }
    const base = v.service && typeof v.service === "object" ? (v.service as Record<string, unknown>) : {};
    const discountPct = Math.min(80, Math.max(0, Math.round(Number(form.get("discountPct") ?? 10)) || 0));
    const maxVideos = Math.min(50, Math.max(1, Math.round(Number(form.get("maxVideos") ?? 10)) || 10));
    const newOnly = form.get("newOnly") === "on";
    await prisma.productVariant.update({ where: { id: variantId }, data: { service: { ...base, pack: items, discountPct, maxVideos, newOnly } } });
    await syncPackPrices();
    await audit(staff.id, "pack.items", "ProductVariant", variantId, { items, discountPct, maxVideos, newOnly });
    refresh();
    return { ok: true, message: "Saved" };
  } catch (e) {
    return fail(e);
  }
}

/** Lock button: keep the current level (Re-analyze leaves it alone), or unlock it. */
export async function toggleRiskLock(variantId: string): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    const meta = parseMeta(v.service);
    if (!meta) return { ok: false, error: "Not a service choice" };
    await prisma.productVariant.update({ where: { id: variantId }, data: { service: { ...meta, riskLocked: !meta.riskLocked } } });
    if (meta.riskLocked) await applyRisk();
    await audit(staff.id, "risk.lock", "ProductVariant", variantId, { locked: !meta.riskLocked });
    refresh();
    return { ok: true, message: meta.riskLocked ? "Unlocked" : "Locked" };
  } catch (e) {
    return fail(e);
  }
}

/** "Learned from real orders": accept raises the level (and locks it); ignore hides the suggestion for 30 days. */
export async function decideLearned(variantId: string, accept: boolean, level: "med" | "high"): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    if (accept) await setChoiceRisk(variantId, level);
    else {
      const s = await getSettings();
      await setSetting("riskLearnIgnored", { ...s.riskLearnIgnored, [variantId]: new Date().toISOString() });
    }
    await audit(staff.id, accept ? "risk.learn.accept" : "risk.learn.ignore", "ProductVariant", variantId, { level });
    refresh();
    return { ok: true, message: accept ? "Level raised" : "Hidden for 30 days" };
  } catch (e) {
    return fail(e);
  }
}

/** Services & risk → "Customer details": the short description and the details card customers see before ordering. */
export async function saveChoiceDetails(variantId: string, form: FormData): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    const meta = parseMeta(v.service);
    if (!meta) return { ok: false, error: "Not a service choice" };
    const str = (k: string, max = 300) => String(form.get(k) ?? "").trim().slice(0, max);
    const cancel = str("cancel");
    const info = cleanInfo({ quality: str("quality"), speed: str("speed"), start: str("start"), drop: str("drop"), location: str("location"), cancel: cancel === "yes" ? true : cancel === "no" ? false : undefined });
    const refill = Number(str("refillDays"));
    const next = {
      ...meta,
      about: { ht: str("about_ht", 400), fr: str("about_fr", 400) },
      avg: { ht: str("avg_ht", 40) || meta.avg.ht, fr: str("avg_fr", 40) || meta.avg.fr },
      refillDays: Number.isInteger(refill) && refill >= 0 && refill <= 365 ? refill : meta.refillDays,
      info,
      postType: (["reel", "shorts", "video"] as const).find((x) => x === str("postType")),
    };
    await prisma.productVariant.update({ where: { id: variantId }, data: { service: next } });
    await audit(staff.id, "choice.details", "ProductVariant", variantId, { info, refillDays: next.refillDays });
    refresh();
    return { ok: true, message: "Saved" };
  } catch (e) {
    return fail(e);
  }
}

/** Services & risk → "Service updates": a note staff write for customers (shown in the order screen's updates tab). */
export async function postUpdateNote(form: FormData): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    const ht = String(form.get("ht") ?? "").trim().slice(0, 300);
    const fr = String(form.get("fr") ?? "").trim().slice(0, 300);
    if (!ht) return { ok: false, error: "Write the note in Kreyòl (French is optional)" };
    const u = await prisma.serviceUpdate.create({ data: { kind: "note", text: { ht, fr: fr || ht } } });
    await audit(staff.id, "update.note", "ServiceUpdate", u.id, {});
    refresh();
    return { ok: true, message: "Posted" };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteUpdate(id: string): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    await prisma.serviceUpdate.delete({ where: { id } });
    await audit(staff.id, "update.delete", "ServiceUpdate", id, {});
    refresh();
    return { ok: true, message: "Removed" };
  } catch (e) {
    return fail(e);
  }
}

/** Provider service cards for a choice (or for a new service: platform + kind + tier). */
export async function providerCandidates(input: { variantId?: string; platform?: string; kind?: string; tier?: number; q?: string }): Promise<{ ok: true; list: Candidate[] } | { ok: false; error: string }> {
  try {
    await assertStaff("catalog.manage");
    const q = (input.q ?? "").slice(0, 80);
    if (input.variantId) return { ok: true, list: await candidatesFor(input.variantId, q) };
    if (!input.platform) return { ok: false, error: "Pick a platform" };
    const kind = (["followers", "likes", "views", "comments", "live"] as const).find((k) => k === input.kind) ?? null;
    return { ok: true, list: await candidatesForSpec({ platform: input.platform, kind, tier: Math.max(0, Math.min(2, Number(input.tier) || 0)), q }) };
  } catch (e) {
    return fail(e) as { ok: false; error: string };
  }
}

export async function pickProviderAction(variantId: string, providerServiceId: string, role: "main" | "backup", setPrice: boolean): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    const ps = await pickProviderService(variantId, providerServiceId, role === "backup" ? "backup" : "main", !!setPrice);
    await applyRisk();
    await applyProfitRules();
    await syncPackPrices();
    await audit(staff.id, "choice.pick", "ProductVariant", variantId, { providerServiceId, role, setPrice });
    refresh();
    return { ok: true, message: `${role === "backup" ? "Backup" : "Main"}: #${ps.serviceId} ${ps.name.slice(0, 60)}` };
  } catch (e) {
    return fail(e);
  }
}

export async function createServiceAction(input: { platform: string; kind: string; picks: (string | null)[] }): Promise<R> {
  try {
    const staff = await assertStaff("catalog.manage");
    const kind = (["followers", "likes", "views", "comments", "live"] as const).find((k) => k === input.kind);
    if (!kind) return { ok: false, error: "Pick the kind of service" };
    const picks = (input.picks ?? []).slice(0, 3).map((x) => (x ? String(x) : null));
    if (!picks.some(Boolean)) return { ok: false, error: "Pick at least one provider service" };
    const r = await createServiceFromProviders({ platform: String(input.platform), kind, picks });
    await audit(staff.id, "service.create", "Product", r.productId, { picks });
    refresh();
    revalidatePath("/[locale]/order", "page");
    return { ok: true, message: `${r.made} choice(s) added and on sale` };
  } catch (e) {
    return fail(e);
  }
}
