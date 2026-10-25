import "server-only";
import type { Prisma, ProviderService } from "@prisma/client";
import { prisma } from "../db";
import { getSettings, type Settings } from "../settings";
import { parseMeta, productKind, type Kind, type ServiceMeta } from "../services";
import { analyzeRisk, type RiskResult } from "../service-risk";
import { infoFromProvider } from "../service-info";
import { formatMoney } from "../money";
import { packPrice, type PackConfig } from "../pack-math";
import { VIP_LEVELS } from "../vip";
import { smmBalance, smmServices } from "./smm";
import { isSmm, serviceIdFor } from "./smm-orders";
import { ytBalance, ytProducts } from "./ytseller";
import { isYtseller } from "./ytseller-orders";

/**
 * Provider catalogs and the choices sold on the site:
 * - sync: copy each SMM provider's service list (price, min/max, refill…) into ProviderService
 * - link: a choice (Bon mache / Pi bon kalite / Rapid) points to one provider service, plus an optional backup
 * - risk: suggested level from the provider's words (service-risk.ts), unless staff locked it
 * - profit: provider cost vs. selling price in the worst case (biggest VIP discount + payment fee); a choice that
 *   loses money is paused, and turned back on when the price or the cost is fixed
 */

const SMM = ["smm_panel", "smm_mock"];
const CATALOG = [...SMM, "ytseller"];

export async function syncProviderServices(supplierId: string) {
  const s = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });
  if (!isSmm(s.preset) && !isYtseller(s.preset)) throw new Error("Only SMM panels and YTSeller have a syncable catalog");
  const now = new Date();
  const existing = new Map((await prisma.providerService.findMany({ where: { supplierId } })).map((x) => [x.serviceId, x]));
  const fresh: Prisma.ProviderServiceCreateManyInput[] = [];
  const changed: Prisma.PrismaPromise<unknown>[] = [];
  let ids: string[] = [];

  if (isYtseller(s.preset)) {
    const list = await ytProducts(s);
    ids = list.map((x) => x.id);
    for (const x of list) {
      const requireNote = x.require.length ? `require:${x.require.join(",")}` : "";
      const kindNote = x.kind === "sms" ? "kind:sms" : "kind:account";
      const desc = [kindNote, requireNote, x.delivery].filter(Boolean).join(" | ").slice(0, 2000) || null;
      const data = {
        name: x.name.slice(0, 500),
        category: x.category.slice(0, 200),
        type: x.delivery.slice(0, 60),
        rate: x.price,
        min: 1,
        max: Math.max(0, x.stock),
        refill: false,
        cancel: false,
        dripfeed: false,
        desc,
      };
      const old = existing.get(x.id);
      if (!old) fresh.push({ supplierId, serviceId: x.id, ...data, seenAt: now });
      else if (old.removedAt || old.name !== data.name || old.category !== data.category || old.type !== data.type || Number(old.rate) !== data.rate || old.min !== data.min || old.max !== data.max || old.desc !== data.desc)
        changed.push(prisma.providerService.update({ where: { id: old.id }, data: { ...data, removedAt: null, ...(Number(old.rate) !== data.rate ? { prevRate: old.rate, rateChangedAt: now } : {}) } }));
    }
    await ytBalance(s).catch(() => null);
  } else {
    const list = await smmServices(s);
    ids = list.map((x) => x.service);
    for (const x of list) {
      const data = { name: x.name.slice(0, 500), category: x.category.slice(0, 200), type: x.type.slice(0, 60), rate: x.rate, min: x.min, max: x.max, refill: x.refill, cancel: x.cancel, dripfeed: x.dripfeed, desc: x.desc?.slice(0, 2000) ?? null };
      const old = existing.get(x.service);
      if (!old) fresh.push({ supplierId, serviceId: x.service, ...data, seenAt: now });
      else if (old.removedAt || old.name !== data.name || old.category !== data.category || old.type !== data.type || Number(old.rate) !== data.rate || old.min !== data.min || old.max !== data.max || old.refill !== data.refill || old.cancel !== data.cancel || old.dripfeed !== data.dripfeed || old.desc !== data.desc)
        changed.push(prisma.providerService.update({ where: { id: old.id }, data: { ...data, removedAt: null, ...(Number(old.rate) !== data.rate ? { prevRate: old.rate, rateChangedAt: now } : {}) } }));
    }
    await smmBalance(s).catch(() => null);
  }

  if (fresh.length) await prisma.providerService.createMany({ data: fresh, skipDuplicates: true });
  for (let i = 0; i < changed.length; i += 200) await prisma.$transaction(changed.slice(i, i + 200));
  if (ids.length) await prisma.providerService.updateMany({ where: { supplierId, serviceId: { in: ids } }, data: { seenAt: now } });
  const added = fresh.length;
  const removed = await prisma.providerService.updateMany({ where: { supplierId, removedAt: null, seenAt: { lt: now } }, data: { removedAt: now } });
  return { total: ids.length, added, updated: changed.length, removed: removed.count };
}

/** Daily: refresh every SMM provider, then re-check risk (unlocked choices) and profit. */
export async function syncAllProviders() {
  const suppliers = await prisma.supplier.findMany({ where: { isEnabled: true, preset: { in: CATALOG } } });
  const out: Record<string, unknown> = {};
  for (const s of suppliers) out[s.name] = await syncProviderServices(s.id).catch((e) => ({ error: e instanceof Error ? e.message : "failed" }));
  await applyRisk();
  await applyProfitRules();
  await updateRealAverages();
  const { syncPackPrices } = await import("../packs");
  await syncPackPrices();
  return out;
}

const choiceInclude = { product: { include: { category: true } }, supplier: true, backupSupplier: true } as const;
export type Choice = Prisma.ProductVariantGetPayload<{ include: typeof choiceInclude }> & { meta: ServiceMeta; provider: ProviderService | null; backup: ProviderService | null };

/** Every service choice on the site, with its linked provider services. */
export async function listChoices(): Promise<Choice[]> {
  const rows = await prisma.productVariant.findMany({ include: choiceInclude, orderBy: [{ product: { category: { sortOrder: "asc" } } }, { product: { sortOrder: "asc" } }, { sortOrder: "asc" }] });
  const services = await prisma.providerService.findMany({
    where: { OR: rows.flatMap((v) => [v.supplierId && v.supplierSku ? { supplierId: v.supplierId, serviceId: { in: skuIds(v.supplierSku) } } : null, v.backupSupplierId && v.backupSupplierSku ? { supplierId: v.backupSupplierId, serviceId: { in: skuIds(v.backupSupplierSku) } } : null]).filter((x): x is NonNullable<typeof x> => !!x) },
  });
  const find = (supplierId: string | null, sku: string | null) => (supplierId && sku ? services.find((p) => p.supplierId === supplierId && p.serviceId === serviceIdFor(sku, { durationMin: "30" })) ?? services.find((p) => p.supplierId === supplierId && skuIds(sku).includes(p.serviceId)) ?? null : null);
  return rows
    .map((v) => ({ ...v, meta: parseMeta(v.service)!, provider: find(v.supplierId, v.supplierSku), backup: find(v.backupSupplierId, v.backupSupplierSku) }))
    .filter((v) => v.meta);
}

/** "101" → ["101"]; live "15=201,30=202" → ["201","202"] */
function skuIds(sku: string) {
  return sku.includes("=") ? sku.split(",").map((p) => p.split("=")[1]?.trim()).filter(Boolean) : [sku.trim()];
}

/** Suggested risk for a choice: from its linked provider service when there is one, else from its own text. */
export function suggestRisk(c: Choice, settings: Pick<Settings, "riskRules" | "riskBlocked">): RiskResult {
  const kind = productKind(c.product.tags);
  const src = c.provider ? { name: c.provider.name, desc: c.provider.desc, category: c.provider.category } : { name: `${(c.product.name as Record<string, string>).fr ?? ""}`, desc: c.meta.desc, category: null };
  return analyzeRisk({ ...src, kind }, settings.riskRules, settings.riskBlocked);
}

/** Re-analyze: unlocked choices get the suggested level; blocked ones are turned off (and back on when no longer blocked). */
export async function applyRisk() {
  const settings = await getSettings();
  let changed = 0;
  for (const c of await listChoices()) {
    if (c.meta.riskLocked) continue;
    const r = suggestRisk(c, settings);
    const blocked = r.level === "blocked";
    const risk = blocked ? c.meta.risk : r.level;
    if (risk === c.meta.risk && blocked === !!c.meta.blocked) continue;
    await prisma.productVariant.update({
      where: { id: c.id },
      data: { service: { ...c.meta, risk, blocked }, ...(blocked ? { isActive: false } : c.meta.blocked && !c.meta.pausedLoss ? { isActive: true } : {}) },
    });
    changed++;
  }
  return changed;
}

/** Staff level for one choice: "auto" unlocks and takes the suggestion; any other level is locked. */
export async function setChoiceRisk(variantId: string, level: "auto" | "low" | "med" | "high" | "blocked") {
  const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
  const meta = parseMeta(v.service);
  if (!meta) throw new Error("Not a service choice");
  if (level === "auto") {
    await prisma.productVariant.update({ where: { id: variantId }, data: { service: { ...meta, riskLocked: false } } });
    await applyRisk();
    return;
  }
  const blocked = level === "blocked";
  await prisma.productVariant.update({
    where: { id: variantId },
    data: { service: { ...meta, risk: blocked ? meta.risk : level, blocked, riskLocked: true }, ...(blocked ? { isActive: false } : meta.blocked && !meta.pausedLoss ? { isActive: true } : {}) },
  });
}

export type Profit = { costHtg: number; sell: number; vip: number; fee: number; ref: number; profit: number; pct: number; status: "ok" | "low" | "loss" | "nocost" };

/**
 * Per 1,000, in HTG centimes. Worst case: the customer has the biggest VIP discount and pays a payment fee.
 * (The referral reward is a fixed amount paid once per new customer, so it isn't counted per service.)
 */
/** Highest referral commission % (counted in the worst case when the program is on). */
export function maxReferralPct(s: Partial<Pick<Settings, "refTiers" | "referralEnabled">>) {
  return s.referralEnabled && s.refTiers?.length ? Math.max(...s.refTiers.map((t) => t.pct)) : 0;
}

export function profitOf(priceHtg: number, rateUsd: number | null, s: Pick<Settings, "htgPerUsd" | "paymentFeePct" | "minProfitPct"> & Partial<Pick<Settings, "refTiers" | "referralEnabled">>): Profit {
  const vipPct = Math.max(...VIP_LEVELS.map((l) => l.discount));
  const vip = Math.round((priceHtg * vipPct) / 100);
  const fee = Math.round(((priceHtg - vip) * s.paymentFeePct) / 100);
  // A referred customer: the referrer gets up to the top tier's % of what the customer paid.
  const ref = Math.round(((priceHtg - vip) * maxReferralPct(s)) / 100);
  if (rateUsd === null) return { costHtg: 0, sell: priceHtg, vip, fee, ref, profit: 0, pct: 0, status: "nocost" };
  const costHtg = Math.round(rateUsd * s.htgPerUsd * 100);
  const profit = priceHtg - vip - fee - ref - costHtg;
  const pct = priceHtg ? (profit / priceHtg) * 100 : 0;
  return { costHtg, sell: priceHtg, vip, fee, ref, profit, pct, status: profit < 0 ? "loss" : pct < s.minProfitPct ? "low" : "ok" };
}

/** Pause linked choices that lose money (when the switch is on); turn back on the ones this paused once they're fine. */
export async function applyProfitRules() {
  const s = await getSettings();
  let paused = 0;
  let resumed = 0;
  for (const c of await listChoices()) {
    if (!c.provider) continue;
    const p = profitOf(c.priceHtg, Number(c.provider.rate), s);
    const losing = p.status === "loss" || !!c.provider.removedAt;
    if (losing && s.autoPauseLoss && !c.meta.pausedLoss) {
      await prisma.productVariant.update({ where: { id: c.id }, data: { isActive: false, service: { ...c.meta, pausedLoss: true } } });
      await postServiceUpdate("paused", c.id);
      paused++;
    } else if ((!losing || !s.autoPauseLoss) && c.meta.pausedLoss) {
      await prisma.productVariant.update({ where: { id: c.id }, data: { isActive: !c.meta.blocked, service: { ...c.meta, pausedLoss: false } } });
      if (!c.meta.blocked) await postServiceUpdate("resumed", c.id);
      resumed++;
    }
  }
  return { paused, resumed };
}

/**
 * Link a choice to a provider service (and an optional backup). The choice's limits follow the provider's
 * (min/max, refill, drip-feed), and the product is set to be delivered by the provider.
 */
export async function linkChoice(variantId: string, input: { supplierId: string | null; sku: string; backupSupplierId: string | null; backupSku: string }) {
  const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
  const meta = parseMeta(v.service);
  if (!meta) throw new Error("Not a service choice");
  const sku = input.sku.trim();
  const backupSku = input.backupSku.trim();
  if (!input.supplierId || !sku) {
    await prisma.productVariant.update({ where: { id: variantId }, data: { supplierId: null, supplierSku: null, backupSupplierId: null, backupSupplierSku: null } });
    return null;
  }
  const ids = skuIds(sku);
  const found = await prisma.providerService.findMany({ where: { supplierId: input.supplierId, serviceId: { in: ids } } });
  if (found.length !== ids.length) throw new Error(`Service ${ids.filter((i) => !found.some((f) => f.serviceId === i)).join(", ")} not found for this provider. Sync the provider first.`);
  if (input.backupSupplierId && backupSku) {
    const b = await prisma.providerService.count({ where: { supplierId: input.backupSupplierId, serviceId: { in: skuIds(backupSku) } } });
    if (!b) throw new Error("Backup service not found for that provider. Sync it first.");
  }
  const main = found[0];
  const refillDays = main.refill ? meta.refillDays || Number(/(\d+)\s*(?:days?|d)\b/i.exec(`${main.name} ${main.desc ?? ""}`)?.[1] ?? 30) : 0;
  // The details card is refilled from the new provider service (the customer description, "about", is kept).
  const info = infoFromProvider(main.name, main.desc, main.cancel);
  const next: ServiceMeta = { ...meta, min: Math.max(...found.map((f) => f.min)), max: Math.min(...found.map((f) => f.max)), refillDays, drip: meta.drip && main.dripfeed, desc: [main.name, main.desc].filter(Boolean).join(" · ").slice(0, 500), info };
  await prisma.$transaction([
    prisma.productVariant.update({ where: { id: variantId }, data: { supplierId: input.supplierId, supplierSku: sku, backupSupplierId: input.backupSupplierId && backupSku ? input.backupSupplierId : null, backupSupplierSku: input.backupSupplierId && backupSku ? backupSku : null, service: next } }),
    prisma.product.update({ where: { id: v.productId }, data: { fulfillmentType: "SUPPLIER_API" } }),
  ]);
  if (!v.supplierId && v.isActive) await postServiceUpdate("new", v.id);
  return main;
}

/** Real delivery time per choice over the last 30 days (sent → completed at the provider), from full deliveries only. */
export async function realAverages(): Promise<Map<string, { minutes: number; orders: number }>> {
  const rows = await prisma.$queryRaw<{ variantId: string; minutes: number; orders: bigint }[]>`
    SELECT oi."variantId", AVG(EXTRACT(EPOCH FROM (so."updatedAt" - so."createdAt")) / 60)::float AS minutes, COUNT(*) AS orders
    FROM "SupplierOrder" so JOIN "OrderItem" oi ON oi.id = so."orderItemId"
    WHERE so.status = 'SUCCESS' AND COALESCE(so."refundedPartial", 0) = 0 AND so."createdAt" > NOW() - INTERVAL '30 days'
    GROUP BY oi."variantId"`;
  return new Map(rows.map((r) => [r.variantId, { minutes: r.minutes, orders: Number(r.orders) }]));
}

/** "45 minit" / "3 èdtan" / "2 jou" (and French). */
export function avgText(minutes: number): Record<string, string> {
  if (minutes < 90) {
    const m = Math.max(5, Math.round(minutes / 5) * 5);
    return { ht: `${m} minit`, fr: `${m} minutes` };
  }
  if (minutes < 48 * 60) {
    const h = Math.round(minutes / 60);
    return { ht: `${h} èdtan`, fr: `${h} heure${h > 1 ? "s" : ""}` };
  }
  const d = Math.round(minutes / 1440);
  return { ht: `${d} jou`, fr: `${d} jours` };
}

/** The "average time" customers see follows real orders once a choice has at least 5 full deliveries this month. */
export async function updateRealAverages() {
  const avg = await realAverages();
  let changed = 0;
  for (const c of await listChoices()) {
    const a = avg.get(c.id);
    if (!a || a.orders < 5) continue;
    const text = avgText(a.minutes);
    if (text.ht === c.meta.avg.ht) continue;
    await prisma.productVariant.update({ where: { id: c.id }, data: { service: { ...c.meta, avg: text } } });
    changed++;
  }
  return changed;
}

/** Dashboard "Needs attention" (mockup): low balance, stuck orders, losing or vanished services, nothing linked yet. */
export async function providerAlerts() {
  const [suppliers, choices, s, stuck] = await Promise.all([
    prisma.supplier.findMany({ where: { isEnabled: true, preset: { in: SMM } } }),
    listChoices(),
    getSettings(),
    prisma.supplierOrder.count({ where: { supplier: { preset: { in: SMM } }, OR: [{ status: "UNKNOWN" }, { status: "PENDING", nextCheckAt: null }, { status: "PENDING", createdAt: { lt: new Date(Date.now() - 6 * 3_600_000) }, remains: null }] } }),
  ]);
  const alerts: { title: string; text: string; href: string; tone: "red" | "amber" | "blue" }[] = [];
  if (stuck) alerts.push({ title: `${stuck} stuck order${stuck > 1 ? "s" : ""}`, text: "No clear answer from the provider (or none for over 6 hours). Re-check on the provider's site, then close or refund.", href: "/admin/suppliers", tone: "red" });
  for (const x of suppliers) {
    if (x.lowBalance != null && x.balance != null && Number(x.balance) < Number(x.lowBalance))
      alerts.push({ title: `${x.name} balance low`, text: `${Number(x.balance)} ${x.balanceCurrency ?? ""} left (warning under ${Number(x.lowBalance)}). Top up before it runs out: orders it refuses go to the backup or are refunded.`, href: `/admin/suppliers/${x.id}`, tone: "amber" });
  }
  const losing = choices.filter((c) => c.provider && profitOf(c.priceHtg, Number(c.provider.rate), s).status === "loss").length;
  if (losing) alerts.push({ title: `${losing} service${losing > 1 ? "s" : ""} ${s.autoPauseLoss ? "paused" : "losing money"}`, text: "The provider's price is above your selling price. Review prices.", href: "/admin/pricing", tone: "blue" });
  const gone = choices.filter((c) => c.provider?.removedAt).length;
  if (gone) alerts.push({ title: `${gone} service${gone > 1 ? "s" : ""} removed by the provider`, text: "Link these choices to another provider service.", href: "/admin/services", tone: "red" });
  // After a sync: price changes on services you sell, and new services from a provider you already use.
  const week = new Date(Date.now() - 7 * 86_400_000);
  for (const c of choices) {
    const p = c.provider;
    if (!p?.rateChangedAt || p.rateChangedAt < week || p.prevRate == null) continue;
    const up = Number(p.rate) > Number(p.prevRate);
    alerts.push({ title: `${c.supplier?.name} ${up ? "raised" : "lowered"} a price`, text: `${(c.product.name as Record<string, string>).ht} · ${(c.name as Record<string, string>).ht}: $${Number(p.prevRate).toFixed(2)} → $${Number(p.rate).toFixed(2)} per 1K. Check the selling price.`, href: "/admin/pricing", tone: up ? "amber" : "blue" });
  }
  for (const x of suppliers) {
    const first = await prisma.providerService.aggregate({ where: { supplierId: x.id }, _min: { firstSeenAt: true } });
    if (!first._min.firstSeenAt) continue;
    const since = new Date(Math.max(week.getTime(), first._min.firstSeenAt.getTime() + 3_600_000));
    const fresh = await prisma.providerService.count({ where: { supplierId: x.id, removedAt: null, firstSeenAt: { gt: since } } });
    if (fresh) alerts.push({ title: `${fresh} new service${fresh > 1 ? "s" : ""} at ${x.name}`, text: "Maybe cheaper or better than what you sell. Compare them in Services & risk.", href: "/admin/services", tone: "blue" });
  }
  if (suppliers.length && !choices.some((c) => c.provider)) alerts.push({ title: "Nothing linked yet", text: "No choice points to a provider service, so orders stay manual. Link them in Services.", href: "/admin/services", tone: "amber" });
  return alerts;
}

/** A starter pack's contents, kept on the pack's choice: which service choices and how many of each. */
export type PackItem = { variantId: string; quantity: number };
export function packItems(service: unknown): PackItem[] {
  const p = (service as { pack?: unknown } | null)?.pack;
  return Array.isArray(p) ? p.filter((x): x is PackItem => !!x && typeof x.variantId === "string" && Number.isInteger(x.quantity) && x.quantity > 0) : [];
}

/** Packs with their contents, price and real profit (worst case, like the single services). */
export async function listPacks(choices?: Choice[]) {
  const all = choices ?? (await listChoices());
  const s = await getSettings();
  const packs = await prisma.productVariant.findMany({ where: { product: { category: { slug: "pake" } } }, include: { product: true }, orderBy: { product: { sortOrder: "asc" } } });
  return packs.map((v) => {
    const config = packConfigOf(v.service);
    const items = config.items.map((it) => ({ ...it, choice: all.find((c) => c.id === it.variantId) ?? null }));
    // Always from the contents: the choices' prices minus the pack discount.
    const price = packPrice(items.map((i) => ({ quantity: i.quantity, rate: i.choice ? i.choice.salePriceHtg ?? i.choice.priceHtg : 0 })), config.discountPct).price;
    const missing = !items.length || items.some((i) => !i.choice?.provider);
    const costUsd = items.reduce((a, i) => a + (i.choice?.provider ? (Number(i.choice.provider.rate) * i.quantity) / 1000 : 0), 0);
    const p = profitOf(price, missing ? null : costUsd, s);
    // Discount against buying the same things one by one at today's prices.
    const separate = items.reduce((a, i) => a + (i.choice ? Math.round((i.choice.priceHtg * i.quantity) / 1000) : 0), 0);
    return { v, items, price, separate, profit: p, config };
  });
}

const NEXT_LEVEL = { low: "med", med: "high", high: "high" } as const;

/**
 * "Learned from real orders": choices whose orders often needed a refill or ended partly delivered this month
 * (at least 10 orders, 15 %+ refills or 20 %+ partial) get a suggestion to raise their risk one level.
 */
export async function learnedSuggestions() {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await prisma.$queryRaw<{ variantId: string; done: bigint; refills: bigint; partial: bigint }[]>`
    SELECT oi."variantId", COUNT(*) FILTER (WHERE so.status = 'SUCCESS') AS done,
      COUNT(*) FILTER (WHERE so."refillAt" IS NOT NULL) AS refills,
      COUNT(*) FILTER (WHERE COALESCE(so."refundedPartial", 0) > 0) AS partial
    FROM "SupplierOrder" so JOIN "OrderItem" oi ON oi.id = so."orderItemId"
    WHERE so."createdAt" > ${since} AND so."supplierOrderId" IS NOT NULL
    GROUP BY oi."variantId"`;
  const s = await getSettings();
  const choices = await listChoices();
  const out: { choice: Choice; text: string; from: string; to: "med" | "high" }[] = [];
  for (const r of rows) {
    const done = Number(r.done);
    const c = choices.find((x) => x.id === r.variantId);
    if (!c || done < 10 || c.meta.blocked || c.meta.risk === "high") continue;
    const ignored = s.riskLearnIgnored[c.id];
    if (ignored && Date.now() - new Date(ignored).getTime() < 30 * 86_400_000) continue;
    const refillPct = Math.round((Number(r.refills) / done) * 100);
    const partialPct = Math.round((Number(r.partial) / done) * 100);
    if (refillPct < 15 && partialPct < 20) continue;
    const to = NEXT_LEVEL[c.meta.risk];
    const name = { low: "Low", med: "Medium", high: "High" };
    const why = refillPct >= 15 ? `${refillPct}% of orders needed a refill this month.` : `${partialPct}% of orders were only partly delivered this month.`;
    out.push({ choice: c, from: c.meta.risk, to, text: `${why} Suggest: ${name[c.meta.risk]} → ${name[to]}.` });
  }
  return out;
}

/**
 * "Nouvèl sèvis" (service updates) tab: a short line per change customers care about, written automatically.
 * new = a choice is now delivered by a provider · price_up/price_down · paused (sells at a loss or removed) · resumed.
 */
export async function postServiceUpdate(kind: "new" | "price_up" | "price_down" | "paused" | "resumed", variantId: string, price?: number) {
  const v = await prisma.productVariant.findUnique({ where: { id: variantId }, include: { product: true } });
  if (!v) return;
  const name = (l: string) => `${(v.product.name as Record<string, string>)[l] ?? ""} · ${(v.name as Record<string, string>)[l] ?? ""}`;
  const p = price !== undefined ? (l: string) => formatMoney(price, "HTG", l) : () => "";
  const text = {
    ht: { new: `Nouvo: ${name("ht")}`, price_up: `Pri a monte: ${name("ht")} (${p("ht")} pou 1,000)`, price_down: `Pri a bese: ${name("ht")} (${p("ht")} pou 1,000)`, paused: `Poze pou kounye a: ${name("ht")}`, resumed: `Disponib ankò: ${name("ht")}` }[kind],
    fr: { new: `Nouveau : ${name("fr")}`, price_up: `Prix en hausse : ${name("fr")} (${p("fr")} pour 1 000)`, price_down: `Prix en baisse : ${name("fr")} (${p("fr")} pour 1 000)`, paused: `En pause pour le moment : ${name("fr")}`, resumed: `De nouveau disponible : ${name("fr")}` }[kind],
  };
  await prisma.serviceUpdate.create({ data: { kind, text, productId: v.productId } }).catch((e) => console.error("service update failed", e));
}

// ───────────── Picking provider services (Admin → Services & risk) ─────────────

const KIND_WORDS: Record<Kind, RegExp> = {
  followers: /follow|subscri|member|abonn/i,
  likes: /\blikes?\b|reaction|heart/i,
  views: /\bviews?\b|\bplays?\b|impression|reach|watch/i,
  comments: /comment/i,
  live: /\blive\b|stream/i,
};
const PLATFORM_WORDS: Record<string, string[]> = {
  tiktok: ["tiktok", "tik tok"],
  instagram: ["instagram", "insta", "ig "],
  youtube: ["youtube", "yt "],
  facebook: ["facebook", "fb "],
  x: ["twitter", "x.com", " x "],
  telegram: ["telegram"],
};

/** Speed per day as a number (the higher end of "5-10K"), for sorting the "Rapid" suggestions. */
export function speedPerDay(speed?: string) {
  const m = /(\d[\d.,]*)\s*([KM])?\s*$/i.exec(speed?.split("-").pop() ?? "");
  if (!m) return 0;
  return Number(m[1].replace(/,/g, "")) * (m[2]?.toUpperCase() === "M" ? 1e6 : m[2] ? 1e3 : 1);
}

/** Selling price per 1,000 (HTG centimes) that leaves the target profit in the worst case, rounded to a clean amount. */
export function suggestPrice(rateUsd: number, s: Pick<Settings, "htgPerUsd" | "paymentFeePct" | "targetProfitPct"> & Partial<Pick<Settings, "refTiers" | "referralEnabled">>) {
  const vip = Math.max(...VIP_LEVELS.map((l) => l.discount)) / 100;
  const keep = 1 - vip - (1 - vip) * (s.paymentFeePct / 100) - (1 - vip) * (maxReferralPct(s) / 100) - s.targetProfitPct / 100;
  const cost = rateUsd * s.htgPerUsd * 100;
  const raw = cost / Math.max(0.05, keep);
  const step = raw < 10_000 ? 500 : 1_000; // under 100 HTG: by 5 HTG, else by 10 HTG
  return Math.max(500, Math.ceil(raw / step) * step);
}

export type Candidate = {
  id: string; supplierId: string; supplierName: string; serviceId: string; name: string; category: string;
  rateUsd: number; costHtg: number; min: number; max: number; refill: boolean; cancel: boolean; dripfeed: boolean;
  speed?: string; start?: string; quality?: string; level: string; score: number; suggestedPrice: number; badges: string[];
};

/**
 * Provider services that fit a choice (same platform and kind), best first for its tier:
 * 1st choice (Bon mache) cheapest · 2nd (Pi bon kalite) refill and lowest risk · 3rd (Rapid) fastest.
 * A search text narrows the list across every provider, so the same service can be compared between providers.
 */
export async function candidatesFor(variantId: string, q = ""): Promise<Candidate[]> {
  const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId }, include: { product: { include: { category: true, variants: { select: { id: true }, orderBy: { sortOrder: "asc" } } } } } });
  const tier = Math.max(0, v.product.variants.findIndex((x) => x.id === v.id));
  return candidatesForSpec({ platform: v.product.category.slug, kind: productKind(v.product.tags), tier, q });
}

/** Same, for a platform + kind + tier (also used to build a brand-new service). */
export async function candidatesForSpec({ platform, kind, tier, q = "" }: { platform: string; kind: Kind | null; tier: number; q?: string }): Promise<Candidate[]> {
  const s = await getSettings();
  const words = PLATFORM_WORDS[platform] ?? [platform];
  const text = q.trim();
  const rows = await prisma.providerService.findMany({
    where: {
      removedAt: null,
      supplier: { isEnabled: true, preset: { in: SMM } },
      ...(text
        ? { OR: [{ name: { contains: text, mode: "insensitive" } }, { category: { contains: text, mode: "insensitive" } }, { serviceId: text }] }
        : { OR: words.flatMap((w) => [{ name: { contains: w.trim(), mode: "insensitive" as const } }, { category: { contains: w.trim(), mode: "insensitive" as const } }]) }),
    },
    include: { supplier: { select: { name: true } } },
    take: 600,
  });
  const fits = text || !kind ? rows : rows.filter((r) => KIND_WORDS[kind].test(`${r.category} ${r.name}`) && (kind === "live" || !/\blive\b|stream/i.test(`${r.category} ${r.name}`)));
  const list = fits.map((r) => {
    const info = infoFromProvider(r.name, r.desc, r.cancel);
    const risk = analyzeRisk({ name: r.name, desc: r.desc, category: r.category, kind }, s.riskRules, s.riskBlocked);
    return {
      id: r.id, supplierId: r.supplierId, supplierName: r.supplier.name, serviceId: r.serviceId, name: r.name, category: r.category,
      rateUsd: Number(r.rate), costHtg: Math.round(Number(r.rate) * s.htgPerUsd * 100), min: r.min, max: r.max, refill: r.refill, cancel: r.cancel, dripfeed: r.dripfeed,
      speed: info.speed, start: info.start, quality: info.quality, level: risk.level, score: risk.score, suggestedPrice: suggestPrice(Number(r.rate), s), badges: [] as string[],
    };
  }).filter((c) => c.level !== "blocked");
  const byTier = [
    (a: Candidate, b: Candidate) => a.rateUsd - b.rateUsd,
    (a: Candidate, b: Candidate) => Number(b.refill) - Number(a.refill) || a.score - b.score || a.rateUsd - b.rateUsd,
    (a: Candidate, b: Candidate) => speedPerDay(b.speed) - speedPerDay(a.speed) || a.rateUsd - b.rateUsd,
  ][Math.min(tier, 2)];
  list.sort(byTier);
  const top = list.slice(0, 12);
  if (top.length) {
    const cheapest = Math.min(...top.map((c) => c.rateUsd));
    const fastest = Math.max(...top.map((c) => speedPerDay(c.speed)));
    const safest = Math.min(...top.map((c) => c.score));
    for (const c of top) {
      if (c.rateUsd === cheapest) c.badges.push("cheapest");
      if (fastest > 0 && speedPerDay(c.speed) === fastest) c.badges.push("fastest");
      if (c.refill) c.badges.push("refill");
      if (c.score === safest) c.badges.push("safest");
    }
  }
  return top;
}

/** Link a picked provider service as the choice's main or backup service, optionally setting the suggested price. */
export async function pickProviderService(variantId: string, providerServiceId: string, role: "main" | "backup", setPrice: boolean) {
  const ps = await prisma.providerService.findUniqueOrThrow({ where: { id: providerServiceId } });
  const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
  if (role === "backup") {
    if (!v.supplierId) throw new Error("Pick the main service first");
    await prisma.productVariant.update({ where: { id: variantId }, data: { backupSupplierId: ps.supplierId, backupSupplierSku: ps.serviceId } });
    return ps;
  }
  await linkChoice(variantId, { supplierId: ps.supplierId, sku: ps.serviceId, backupSupplierId: v.backupSupplierId, backupSku: v.backupSupplierSku ?? "" });
  if (setPrice) {
    const price = suggestPrice(Number(ps.rate), await getSettings());
    if (price !== v.priceHtg) {
      await prisma.productVariant.update({ where: { id: variantId }, data: { priceHtg: price, salePriceHtg: null } });
      if (v.supplierId) await postServiceUpdate(price > v.priceHtg ? "price_up" : "price_down", variantId, price);
    }
  }
  return ps;
}

/**
 * New service in one go: platform + kind, and up to three provider services (Bon mache / Pi bon kalite / Rapid).
 * Creates the product if it doesn't exist (published, delivered by the providers), each choice with the provider's
 * limits, details and a suggested price; risk levels are worked out right after.
 */
export async function createServiceFromProviders(input: { platform: string; kind: Kind; picks: (string | null)[] }) {
  const { KIND_NAMES, CHEAP, BEST, FAST, linkField } = await import("../demo-catalog");
  const category = await prisma.category.findUniqueOrThrow({ where: { slug: input.platform } });
  const platformName = (category.name as Record<string, string>).ht ?? input.platform;
  const slug = `${input.platform}-${input.kind}`;
  const post = input.kind === "likes" || input.kind === "views" || input.kind === "comments";
  const product = (await prisma.product.findUnique({ where: { slug } })) ?? (await prisma.product.create({
    data: {
      slug, categoryId: category.id,
      name: { ht: `${platformName} ${KIND_NAMES[input.kind].ht}`, fr: `${KIND_NAMES[input.kind].fr} ${(category.name as Record<string, string>).fr ?? platformName}` },
      description: { ht: "", fr: "" }, isPublished: true, fulfillmentType: "SUPPLIER_API", fields: [linkField(post)], tags: [`kind:${input.kind}`],
    },
  }));
  const names = [CHEAP, BEST, FAST];
  const existing = await prisma.productVariant.count({ where: { productId: product.id } });
  const s = await getSettings();
  let made = 0;
  for (const [i, id] of input.picks.entries()) {
    if (!id) continue;
    const ps = await prisma.providerService.findUniqueOrThrow({ where: { id } });
    const info = infoFromProvider(ps.name, ps.desc, ps.cancel);
    const type = input.kind === "comments" ? "comments" : input.kind === "live" ? "live" : "default";
    const meta: ServiceMeta = {
      type, min: ps.min, max: ps.max, avg: { ht: "—", fr: "—" }, risk: "med",
      refillDays: ps.refill ? Number(/(\d+)\s*(?:days?|d)\b/i.exec(`${ps.name} ${ps.desc ?? ""}`)?.[1] ?? 30) : 0,
      drip: ps.dripfeed, desc: [ps.name, ps.desc].filter(Boolean).join(" · ").slice(0, 500), info,
    };
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, name: names[i], priceHtg: suggestPrice(Number(ps.rate), s), sortOrder: existing + i, supplierId: ps.supplierId, supplierSku: ps.serviceId, service: meta },
    });
    await postServiceUpdate("new", variant.id);
    made++;
  }
  await prisma.product.update({ where: { id: product.id }, data: { fulfillmentType: "SUPPLIER_API" } });
  await applyRisk();
  await applyProfitRules();
  return { productId: product.id, made };
}

function packConfigOf(service: unknown): PackConfig {
  const o = (service && typeof service === "object" ? service : {}) as Record<string, unknown>;
  return { items: packItems(service), discountPct: Number.isFinite(Number(o.discountPct)) ? Number(o.discountPct) : 10, maxVideos: Number(o.maxVideos) || 10, newOnly: o.newOnly === true };
}
