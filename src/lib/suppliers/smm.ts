import "server-only";
import { prisma } from "../db";
import { secretsOf } from "./engine";

/**
 * Standard SMM panel API ("API v2"): one address, form POST with `key` and `action`.
 * Actions: services, add, status (one order, or up to 100 with `orders`), balance, refill, refill_status, cancel.
 * Used for every supplier whose preset is "smm_panel" (Admin → Suppliers: paste the API address and key).
 */

export type SmmStatus = "Pending" | "In progress" | "Processing" | "Completed" | "Partial" | "Canceled" | string;
export type SmmProgress = { status: SmmStatus; startCount: number | null; remains: number | null; charge: number | null; error?: string };
export type SmmService = { service: string; name: string; type: string; category: string; rate: number; min: number; max: number; refill: boolean; cancel: boolean; dripfeed: boolean; desc?: string };

/** Our meaning of a provider status. */
export function smmOutcome(status: string): "running" | "done" | "partial" | "canceled" | "unknown" {
  const s = status.trim().toLowerCase();
  if (s === "completed") return "done";
  if (s === "partial") return "partial";
  if (s === "canceled" || s === "cancelled" || s === "refunded") return "canceled";
  if (["pending", "in progress", "processing", "inprogress"].includes(s)) return "running";
  return "unknown";
}

const MAX_LOG = 4000;
const bool = (v: unknown) => v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true";
const int = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));

type Row = { id: string; baseUrl: string; secrets: string | null };

/** One call: form POST, JSON reply, logged with the API key removed. Network trouble returns { error }. */
export async function smmCall(s: Row, action: string, params: Record<string, string | number | undefined> = {}, supplierOrderId: string | null = null): Promise<{ http: number | null; data: unknown; error?: string }> {
  const key = secretsOf(s).apiKey ?? "";
  const form = new URLSearchParams({ key, action });
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") form.set(k, String(v));
  const url = s.baseUrl.startsWith("/") ? `${process.env.SUPPLIER_SELF_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`}${s.baseUrl}` : s.baseUrl;
  const started = Date.now();
  let http: number | null = null;
  let text = "";
  let data: unknown = null;
  let error: string | undefined;
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: form.toString(), signal: AbortSignal.timeout(25_000), cache: "no-store" });
    http = res.status;
    text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      error = "The provider did not answer with JSON";
    }
    if (!error && data && typeof data === "object" && !Array.isArray(data) && "error" in data) error = String((data as { error: unknown }).error);
    if (!error && http >= 400) error = `HTTP ${http}`;
  } catch (e) {
    error = e instanceof Error ? e.message : "Request failed";
  }
  const hide = (x: string) => (key.length >= 4 ? x.split(key).join("•••") : x).slice(0, MAX_LOG);
  if (action !== "services") {
    await prisma.supplierLog
      .create({ data: { supplierId: s.id, supplierOrderId, op: action, request: hide(`POST ${url}\n\n${form.toString()}`), response: hide(text || error || ""), httpStatus: http, ms: Date.now() - started, outcome: error ? "ERROR" : "OK" } })
      .catch((e) => console.error("supplier log failed", e));
  }
  return { http, data, error };
}

export async function smmServices(s: Row): Promise<SmmService[]> {
  const r = await smmCall(s, "services");
  if (r.error || !Array.isArray(r.data)) throw new Error(r.error ?? "Unexpected services reply");
  return (r.data as Record<string, unknown>[]).map((x) => ({
    service: String(x.service ?? ""),
    name: String(x.name ?? ""),
    type: String(x.type ?? "Default"),
    category: String(x.category ?? ""),
    rate: Number(x.rate ?? 0),
    min: int(x.min) ?? 0,
    max: int(x.max) ?? 0,
    refill: bool(x.refill),
    cancel: bool(x.cancel),
    dripfeed: bool(x.dripfeed),
    desc: typeof x.desc === "string" ? x.desc : typeof x.description === "string" ? x.description : undefined,
  })).filter((x) => x.service);
}

export type AddInput = { service: string; link: string; quantity?: number; comments?: string; username?: string; runs?: number; interval?: number };

/**
 * Place an order. "ok" with the provider's order id; "refused" when the provider clearly said no (an error message,
 * nothing created); "unknown" when we can't tell (timeout, server error): never sent again, checked by staff.
 */
export async function smmAdd(s: Row, input: AddInput, supplierOrderId: string): Promise<{ result: "ok"; orderId: string } | { result: "refused" | "unknown"; message: string }> {
  const r = await smmCall(s, "add", { service: input.service, link: input.link, quantity: input.comments ? undefined : input.quantity, comments: input.comments, username: input.username, runs: input.runs, interval: input.interval }, supplierOrderId);
  const id = r.data && typeof r.data === "object" ? (r.data as { order?: unknown }).order : undefined;
  if (!r.error && id !== undefined && id !== null && String(id) !== "") return { result: "ok", orderId: String(id) };
  const unsure = r.http === null || (r.http !== null && r.http >= 500) || r.http === 429 || r.error === "The provider did not answer with JSON";
  return { result: unsure ? "unknown" : "refused", message: r.error ?? "No order id in the reply" };
}

function progress(x: unknown): SmmProgress {
  const o = (x ?? {}) as Record<string, unknown>;
  return { status: String(o.status ?? ""), startCount: int(o.start_count), remains: int(o.remains), charge: o.charge === undefined ? null : Number(o.charge), error: typeof o.error === "string" ? o.error : undefined };
}

/** Status of up to 100 orders in one call (provider order id → progress). */
export async function smmStatuses(s: Row, orderIds: string[]): Promise<Map<string, SmmProgress>> {
  const out = new Map<string, SmmProgress>();
  for (let i = 0; i < orderIds.length; i += 100) {
    const chunk = orderIds.slice(i, i + 100);
    if (chunk.length === 1) {
      const r = await smmCall(s, "status", { order: chunk[0] });
      if (!r.error) out.set(chunk[0], progress(r.data));
      continue;
    }
    const r = await smmCall(s, "status", { orders: chunk.join(",") });
    if (r.error || !r.data || typeof r.data !== "object") continue;
    for (const id of chunk) {
      const p = (r.data as Record<string, unknown>)[id];
      if (p) out.set(id, progress(p));
    }
  }
  return out;
}

export async function smmBalance(s: Row): Promise<{ balance: number; currency: string } | null> {
  const r = await smmCall(s, "balance");
  if (r.error) return null;
  const d = (r.data ?? {}) as { balance?: unknown; currency?: unknown };
  const balance = Number(d.balance);
  if (!Number.isFinite(balance)) return null;
  await prisma.supplier.update({ where: { id: s.id }, data: { balance, balanceCurrency: String(d.currency ?? "USD"), balanceAt: new Date() } });
  return { balance, currency: String(d.currency ?? "USD") };
}

export async function smmRefill(s: Row, orderId: string, supplierOrderId: string): Promise<{ ok: true; refillId: string } | { ok: false; message: string }> {
  const r = await smmCall(s, "refill", { order: orderId }, supplierOrderId);
  const id = r.data && typeof r.data === "object" ? (r.data as { refill?: unknown }).refill : undefined;
  if (!r.error && id !== undefined && id !== null && typeof id !== "object") return { ok: true, refillId: String(id) };
  return { ok: false, message: r.error ?? "Refill refused" };
}

export async function smmRefillStatus(s: Row, refillId: string): Promise<string | null> {
  const r = await smmCall(s, "refill_status", { refill: refillId });
  return r.error ? null : String((r.data as { status?: unknown })?.status ?? "") || null;
}

/** Ask the provider to cancel. Money only comes back once the provider reports the order as Canceled. */
export async function smmCancel(s: Row, orderId: string, supplierOrderId: string): Promise<{ ok: boolean; message?: string }> {
  const r = await smmCall(s, "cancel", { orders: orderId }, supplierOrderId);
  if (r.error) return { ok: false, message: r.error };
  const first = Array.isArray(r.data) ? (r.data[0] as { cancel?: unknown } | undefined) : undefined;
  const c = first?.cancel;
  if (c && typeof c === "object" && "error" in (c as object)) return { ok: false, message: String((c as { error: unknown }).error) };
  return { ok: true };
}
