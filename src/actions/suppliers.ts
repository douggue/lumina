"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { assertStaff, assertStepUp } from "@/lib/session";
import { audit } from "@/lib/audit";
import { encrypt, randomToken } from "@/lib/crypto";
import { PRESETS } from "@/lib/suppliers/presets";
import { callSupplier, secretsOf } from "@/lib/suppliers/engine";
import { checkSupplierOrder, closeSupplierLine, finishOrders, retrySupplierLine } from "@/lib/suppliers/orders";
import { mockSupplierAllowed } from "@/lib/suppliers/mock";
import { smmBalance, smmStatuses } from "@/lib/suppliers/smm";
import { isSmm } from "@/lib/suppliers/smm-orders";
import type { SupplierConfig } from "@/lib/suppliers/types";

type R = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): R => ({ ok: false, error: e instanceof Error ? e.message : "Unexpected error" });

function checkBaseUrl(url: string) {
  if (url.startsWith("/")) {
    if (!mockSupplierAllowed()) throw new Error("The test supplier only works on test setups");
    return;
  }
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("The supplier address must start with https://");
}

function checkConfig(raw: string): SupplierConfig {
  let cfg: SupplierConfig;
  try {
    cfg = JSON.parse(raw);
  } catch {
    throw new Error("Advanced settings: not valid JSON");
  }
  if (!cfg || typeof cfg !== "object" || !cfg.order?.method || cfg.order.path === undefined) throw new Error('Advanced settings: an "order" operation with method and path is required');
  if (!Array.isArray(cfg.secrets)) throw new Error('Advanced settings: "secrets" must be a list of names');
  return cfg;
}

export async function createSupplier(form: FormData) {
  const staff = await assertStaff("settings.manage");
  const preset = PRESETS[String(form.get("preset"))];
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  if (!preset || !name) throw new Error("Name and type are required");
  checkBaseUrl(preset.baseUrl);
  const s = await prisma.supplier.create({
    data: { name, preset: String(form.get("preset")), baseUrl: preset.baseUrl, config: preset.config as object, callbackToken: randomToken(24), isEnabled: false },
  });
  await audit(staff.id, "supplier.create", "Supplier", s.id, { name, preset: s.preset });
  redirect(`/admin/suppliers/${s.id}`);
}

/** Settings and keys. Keys are write-only: a blank field keeps the saved one. Needs a fresh 2FA confirmation. */
export async function saveSupplier(form: FormData): Promise<R> {
  try {
    const staff = await assertStaff("settings.manage");
    await assertStepUp();
    const id = String(form.get("id"));
    const s = await prisma.supplier.findUniqueOrThrow({ where: { id } });
    const config = checkConfig(String(form.get("config") ?? ""));
    const baseUrl = String(form.get("baseUrl") ?? "").trim();
    checkBaseUrl(baseUrl);
    const secrets = secretsOf(s);
    const changed: string[] = [];
    for (const name of config.secrets) {
      const v = String(form.get(`secret_${name}`) ?? "").trim();
      if (v) {
        secrets[name] = v;
        changed.push(name);
      }
    }
    for (const k of Object.keys(secrets)) if (!config.secrets.includes(k)) delete secrets[k];
    const low = String(form.get("lowBalance") ?? "").trim();
    await prisma.supplier.update({
      where: { id },
      data: {
        name: String(form.get("name") ?? s.name).trim().slice(0, 80) || s.name,
        baseUrl,
        config: config as object,
        isEnabled: form.get("isEnabled") === "on",
        lowBalance: low ? Number(low) : null,
        secrets: Object.keys(secrets).length ? encrypt(JSON.stringify(secrets)) : null,
        // New keys or address: log in again next time.
        ...(changed.length || baseUrl !== s.baseUrl ? { tokenEncrypted: null, tokenExpiresAt: null } : {}),
      },
    });
    await audit(staff.id, "supplier.update", "Supplier", id, { keysChanged: changed, enabled: form.get("isEnabled") === "on" });
    revalidatePath(`/admin/suppliers/${id}`);
    return { ok: true, message: changed.length ? `Saved (${changed.join(", ")} updated)` : "Saved" };
  } catch (e) {
    return fail(e);
  }
}

/** Test buttons: balance, login, or the status of one of our references. Nothing is ordered. */
export async function testSupplier(id: string, what: "balance" | "token" | "status", ref = ""): Promise<R> {
  try {
    await assertStaff("settings.manage");
    const sup = await prisma.supplier.findUniqueOrThrow({ where: { id } });
    if (isSmm(sup.preset)) {
      if (what === "balance") {
        const b = await smmBalance(sup);
        return b ? { ok: true, message: `Balance: ${b.balance} ${b.currency}` } : { ok: false, error: "No balance in the reply. Check the API address and key, then see the request log." };
      }
      if (what === "status") {
        const so = await prisma.supplierOrder.findFirst({ where: { supplierId: id, OR: [{ ref: ref.trim() }, { supplierOrderId: ref.trim() }] } });
        const p = (await smmStatuses(sup, [so?.supplierOrderId ?? ref.trim()])).values().next().value;
        return p ? { ok: true, message: `Status: ${p.status}${p.startCount != null ? ` · start ${p.startCount}` : ""}${p.remains != null ? ` · remains ${p.remains}` : ""}${p.error ? ` · ${p.error}` : ""}` } : { ok: false, error: "No answer for this order" };
      }
      return { ok: false, error: "SMM panels use a key, there is no login to test" };
    }
    if (what === "status") {
      const so = ref.trim() ? await prisma.supplierOrder.findFirst({ where: { supplierId: id, ref: ref.trim() } }) : null;
      const r = await callSupplier(id, "status", { ref: ref.trim(), supplierOrderId: so?.supplierOrderId ?? "", sku: "", skuParts: [], fields: {}, quantity: 1 }, so?.id ?? null);
      return { ok: true, message: `Status: ${r.outcome}${r.httpStatus ? ` (HTTP ${r.httpStatus})` : ""}${r.message ? ` · ${r.message}` : ""}${r.codes.length ? ` · ${r.codes.length} code(s) found` : ""}` };
    }
    const r = await callSupplier(id, what);
    if (what === "token") return r.token ? { ok: true, message: "Login works" } : { ok: false, error: `Login failed${r.httpStatus ? ` (HTTP ${r.httpStatus})` : ""}${r.message ? `: ${r.message}` : ""}` };
    if (r.balance === undefined || !Number.isFinite(r.balance)) return { ok: false, error: `No balance in the reply${r.httpStatus ? ` (HTTP ${r.httpStatus})` : ""}${r.message ? `: ${r.message}` : ""}. See the request log.` };
    revalidatePath(`/admin/suppliers/${id}`);
    return { ok: true, message: `Balance: ${r.balance} ${r.currency ?? ""}` };
  } catch (e) {
    return fail(e);
  } finally {
    revalidatePath(`/admin/suppliers/${id}`);
  }
}

/** Supplier order actions for staff: check now, send again (failed only), or close (handled by hand). */
export async function supplierOrderAction(id: string, action: "check" | "retry" | "close", note = ""): Promise<R> {
  try {
    const staff = await assertStaff("orders.manage");
    const so = await prisma.supplierOrder.findUniqueOrThrow({ where: { id }, include: { orderItem: { select: { orderId: true } } } });
    let message = "Done";
    if (action === "check") {
      const delivered = await checkSupplierOrder(id, true);
      if (delivered) await finishOrders([delivered]);
      const now = await prisma.supplierOrder.findUniqueOrThrow({ where: { id } });
      message = `Now: ${now.status}${now.message ? ` · ${now.message}` : ""}`;
    } else if (action === "retry") {
      await retrySupplierLine(id);
      message = "Sent again";
    } else {
      if (!note.trim()) return { ok: false, error: "Write what happened (delivered by hand, refunded…)" };
      await closeSupplierLine(id, `${note.trim()} (by ${staff.name})`);
      message = "Closed";
    }
    await audit(staff.id, `supplierOrder.${action}`, "SupplierOrder", id, { note: note.slice(0, 200) });
    revalidatePath(`/admin/suppliers/${so.supplierId}`);
    revalidatePath(`/admin/orders/${so.orderItem.orderId}`);
    return { ok: true, message };
  } catch (e) {
    return fail(e);
  }
}
