import "server-only";
import { prisma } from "../db";
import { secretsOf } from "./engine";

/**
 * YTSeller account / SMS API (https://ytseller.com/api/v2): same form style as SMM API v2
 * (key + action). Actions: products, add_product_order (trans_id = our ref → resend never buys twice),
 * product_order_status, result_product (delivered login / SMS lines), balance.
 */

export type YtProduct = {
  id: string;
  name: string;
  category: string;
  /** Per-piece USD price (not per 1,000) */
  price: number;
  stock: number;
  /** Instant | Within 24h | … */
  delivery: string;
  /** Extra form fields the provider asks for (comma / array) */
  require: string[];
  /** Heuristic: SMS verification number vs account login */
  kind: "sms" | "account";
};

export type YtStatus = "Pending" | "Processing" | "In progress" | "Completed" | "Partial" | "Canceled" | string;

const MAX_LOG = 4000;
const int = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? 0 : Math.round(Number(v)));

type Row = { id: string; baseUrl: string; secrets: string | null };

/** Our meaning of a provider status. */
export function ytOutcome(status: string): "running" | "done" | "partial" | "canceled" | "unknown" {
  const s = status.trim().toLowerCase();
  if (s === "completed" || s === "complete" || s === "success" || s === "delivered") return "done";
  if (s === "partial") return "partial";
  if (s === "canceled" || s === "cancelled" || s === "refunded" || s === "failed") return "canceled";
  if (["pending", "in progress", "processing", "inprogress", "waiting"].includes(s)) return "running";
  return "unknown";
}

/** One call: form POST, JSON reply, logged with the API key removed. */
export async function ytCall(s: Row, action: string, params: Record<string, string | number | undefined> = {}, supplierOrderId: string | null = null): Promise<{ http: number | null; data: unknown; error?: string }> {
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
  if (action !== "products") {
    await prisma.supplierLog
      .create({ data: { supplierId: s.id, supplierOrderId, op: action, request: hide(`POST ${url}\n\n${form.toString()}`), response: hide(text || error || ""), httpStatus: http, ms: Date.now() - started, outcome: error ? "ERROR" : "OK" } })
      .catch((e) => console.error("supplier log failed", e));
  }
  return { http, data, error };
}

function parseRequire(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) return raw.split(/[,|]/).map((x) => x.trim()).filter(Boolean);
  return [];
}

function guessKind(name: string, category: string): "sms" | "account" {
  const t = `${name} ${category}`.toLowerCase();
  if (/\b(sms|otp|verification number|phone number|verify)\b/.test(t)) return "sms";
  return "account";
}

/** Map one products[] row (field names vary slightly across panels). */
export function mapYtProduct(x: Record<string, unknown>): YtProduct | null {
  const id = String(x.id ?? x.product ?? x.product_id ?? "").trim();
  if (!id) return null;
  const name = String(x.name ?? x.title ?? id);
  const category = String(x.category ?? x.cat ?? "");
  const price = Number(x.price ?? x.rate ?? 0);
  const stock = int(x.stock ?? x.quantity ?? x.qty ?? x.count);
  const delivery = String(x.delivery ?? x.delivery_time ?? x.type ?? "Instant");
  return {
    id,
    name,
    category,
    price: Number.isFinite(price) ? price : 0,
    stock: Math.max(0, stock),
    delivery,
    require: parseRequire(x.require ?? x.required ?? x.fields),
    kind: guessKind(name, category),
  };
}

export async function ytProducts(s: Row): Promise<YtProduct[]> {
  const r = await ytCall(s, "products");
  if (r.error) throw new Error(r.error);
  const list = Array.isArray(r.data) ? r.data : Array.isArray((r.data as { products?: unknown })?.products) ? (r.data as { products: unknown[] }).products : null;
  if (!list) throw new Error("Unexpected products reply");
  return (list as Record<string, unknown>[]).map(mapYtProduct).filter((x): x is YtProduct => !!x);
}

export type YtAddInput = { productId: string; quantity?: number; transId: string; fields?: Record<string, string> };

/**
 * Place an account/SMS order. trans_id is our SupplierOrder.ref — resending the same id must not buy twice.
 * "ok" with the provider order id; "refused" when the provider clearly said no; "unknown" on timeout/5xx.
 */
export async function ytAdd(s: Row, input: YtAddInput, supplierOrderId: string): Promise<{ result: "ok"; orderId: string } | { result: "refused" | "unknown"; message: string }> {
  const params: Record<string, string | number | undefined> = {
    product_id: input.productId,
    quantity: input.quantity ?? 1,
    trans_id: input.transId,
  };
  for (const [k, v] of Object.entries(input.fields ?? {})) {
    if (["link", "quantity", "noWarrantyAcceptedAt", "publicConfirmedAt", "riskAcceptedAt", "trial"].includes(k)) continue;
    if (v) params[k] = v;
  }
  const r = await ytCall(s, "add_product_order", params, supplierOrderId);
  const id = r.data && typeof r.data === "object" ? (r.data as { order?: unknown; id?: unknown }).order ?? (r.data as { id?: unknown }).id : undefined;
  if (!r.error && id !== undefined && id !== null && String(id) !== "") return { result: "ok", orderId: String(id) };
  // Same trans_id already placed: some panels return the existing order id under "order" with an info message.
  const unsure = r.http === null || (r.http !== null && r.http >= 500) || r.http === 429 || r.error === "The provider did not answer with JSON";
  return { result: unsure ? "unknown" : "refused", message: r.error ?? "No order id in the reply" };
}

export async function ytStatus(s: Row, orderId: string, supplierOrderId: string | null = null): Promise<{ status: YtStatus; charge: number | null; error?: string }> {
  const r = await ytCall(s, "product_order_status", { order: orderId, order_id: orderId }, supplierOrderId);
  if (r.error) return { status: "", charge: null, error: r.error };
  const o = (r.data ?? {}) as Record<string, unknown>;
  return { status: String(o.status ?? ""), charge: o.charge === undefined || o.charge === "" ? null : Number(o.charge), error: typeof o.error === "string" ? o.error : undefined };
}

/** Delivered login / SMS lines from result_product. */
export function parseYtResult(data: unknown): string[] {
  if (data == null) return [];
  if (typeof data === "string") return data.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (Array.isArray(data)) {
    return data.flatMap((x) => {
      if (typeof x === "string") return [x.trim()].filter(Boolean);
      if (x && typeof x === "object") {
        const o = x as Record<string, unknown>;
        const line = o.result ?? o.code ?? o.account ?? o.login ?? o.line ?? o.sms ?? o.message;
        if (typeof line === "string" && line.trim()) return [line.trim()];
        const user = o.username ?? o.email ?? o.user;
        const pass = o.password ?? o.pass;
        if (user != null && pass != null) return [`${user}:${pass}`];
      }
      return [];
    });
  }
  if (typeof data === "object") {
    const o = data as Record<string, unknown>;
    if ("result" in o) return parseYtResult(o.result);
    if ("results" in o) return parseYtResult(o.results);
    if ("data" in o) return parseYtResult(o.data);
    if ("codes" in o) return parseYtResult(o.codes);
  }
  return [];
}

export async function ytResult(s: Row, orderId: string, supplierOrderId: string | null = null): Promise<{ lines: string[]; error?: string }> {
  const r = await ytCall(s, "result_product", { order: orderId, order_id: orderId }, supplierOrderId);
  if (r.error) return { lines: [], error: r.error };
  return { lines: parseYtResult(r.data) };
}

export async function ytBalance(s: Row): Promise<{ balance: number; currency: string } | null> {
  const r = await ytCall(s, "balance");
  if (r.error) return null;
  const d = (r.data ?? {}) as { balance?: unknown; currency?: unknown };
  const balance = Number(d.balance);
  if (!Number.isFinite(balance)) return null;
  await prisma.supplier.update({ where: { id: s.id }, data: { balance, balanceCurrency: String(d.currency ?? "USD"), balanceAt: new Date() } });
  return { balance, currency: String(d.currency ?? "USD") };
}
