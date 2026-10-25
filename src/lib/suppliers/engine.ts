import "server-only";
import { prisma } from "../db";
import { decrypt, encrypt } from "../crypto";
import { baseContext, readPath, render, renderValue, type Ctx } from "./template";
import type { CallResult, DeliveredCode, Operation, Outcome, SupplierConfig } from "./types";

type SupplierRow = { id: string; baseUrl: string; config: unknown; secrets: string | null; tokenEncrypted: string | null; tokenExpiresAt: Date | null };
export type OpName = "order" | "status" | "codes" | "balance" | "token";

export function secretsOf(s: { secrets: string | null }): Record<string, string> {
  if (!s.secrets) return {};
  try {
    return JSON.parse(decrypt(s.secrets)) as Record<string, string>;
  } catch {
    return {};
  }
}

const MAX_LOG = 4000;

function redact(text: string, hide: string[]): string {
  let out = text;
  for (const h of hide) if (h && h.length >= 4) out = out.split(h).join("•••");
  return out.length > MAX_LOG ? out.slice(0, MAX_LOG) + "…" : out;
}

function asCodes(op: Operation, data: unknown): DeliveredCode[] {
  const m = op.map ?? {};
  const pick = (o: unknown, path?: string) => (path ? readPath(o, path) : undefined);
  const one = (o: unknown): DeliveredCode | null => {
    if (o == null) return null;
    if (typeof o !== "object") return String(o).trim() ? { code: String(o).trim() } : null;
    const code = pick(o, m.code ?? "code") ?? pick(o, m.pin ?? "pin");
    if (code == null || String(code).trim() === "") return null;
    const s = (p?: string) => {
      const v = pick(o, p);
      return v == null || v === "" ? undefined : String(v);
    };
    return { code: String(code).trim(), pin: m.pin && m.pin !== m.code ? s(m.pin) : undefined, serial: s(m.serial), expiry: s(m.expiry) };
  };
  if (m.codes) {
    const v = readPath(data, m.codes);
    const list = Array.isArray(v) ? v : v == null ? [] : [v];
    return list.map(one).filter((x): x is DeliveredCode => !!x);
  }
  if (m.code) {
    const c = one(data);
    return c ? [c] : [];
  }
  return [];
}

function readOutcome(op: Operation, kind: OpName, http: number, data: unknown): { outcome: Outcome | "UNKNOWN"; message?: string } {
  const m = op.map ?? {};
  const message = m.message ? String(readPath(data, m.message) ?? "") || undefined : undefined;
  // We can't be sure the supplier got (or didn't get) the request: never treat as a failure.
  if (http >= 500 || http === 401 || http === 403 || http === 408 || http === 429) return { outcome: "UNKNOWN", message };
  if (http >= 400) return { outcome: kind === "order" ? "FAILED" : "UNKNOWN", message };
  if (m.status) {
    const raw = readPath(data, m.status);
    const key = String(raw ?? "").trim().toLowerCase();
    const map = Object.fromEntries(Object.entries(op.statusMap ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    if (key && map[key]) return { outcome: map[key], message };
  }
  if (op.errorPath) {
    const e = readPath(data, op.errorPath);
    if (e && e !== "0" && e !== "false") return { outcome: kind === "order" ? "FAILED" : "UNKNOWN", message: message ?? String(e) };
  }
  if (op.okOutcome) return { outcome: op.okOutcome, message };
  if (kind === "balance" || kind === "token" || kind === "codes") return { outcome: "SUCCESS", message };
  return { outcome: "UNKNOWN", message };
}

async function ensureToken(s: SupplierRow, cfg: SupplierConfig, secret: Record<string, string>): Promise<string | undefined> {
  if (!cfg.token) return undefined;
  if (s.tokenEncrypted && s.tokenExpiresAt && s.tokenExpiresAt.getTime() > Date.now() + 60_000) {
    try {
      return decrypt(s.tokenEncrypted);
    } catch {}
  }
  const r = await callRaw(s, cfg, "token", {}, secret, undefined, null);
  if (!r.token) throw new Error(`Login to supplier failed${r.message ? `: ${r.message}` : ""}`);
  const expiresAt = new Date(Date.now() + Math.max(120, r.expiresIn ?? 3600) * 1000);
  await prisma.supplier.update({ where: { id: s.id }, data: { tokenEncrypted: encrypt(r.token), tokenExpiresAt: expiresAt } });
  return r.token;
}

async function callRaw(s: SupplierRow, cfg: SupplierConfig, kind: OpName, extra: Ctx, secret: Record<string, string>, token: string | undefined, supplierOrderId: string | null): Promise<CallResult> {
  const op = cfg[kind];
  if (!op) throw new Error(`This supplier has no "${kind}" operation`);
  const ctx: Ctx = { ...baseContext(), ...extra, secret, token };
  const fields = (renderValue(op.body ?? {}, ctx) ?? {}) as Record<string, unknown>;
  ctx.params = fields;
  for (const [k, v] of Object.entries(op.signed ?? {})) fields[k] = render(v, ctx);
  const path = String(render(op.path, ctx));
  const enc = op.encoding ?? "json";
  // A base URL starting with "/" is this site itself (the built-in test supplier).
  const base = s.baseUrl.startsWith("/") ? `${process.env.SUPPLIER_SELF_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`}${s.baseUrl}` : s.baseUrl;
  let url = /^https?:\/\//.test(path) ? path : base.replace(/\/+$/, "") + (path.startsWith("/") || !path ? path : `/${path}`);
  let body: string | undefined;
  if (enc === "query" || op.method === "GET") {
    const q = new URLSearchParams(Object.entries(fields).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v ?? "")]));
    if ([...q.keys()].length) url += (url.includes("?") ? "&" : "?") + q.toString();
  } else if (enc === "form") {
    body = new URLSearchParams(Object.entries(fields).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v ?? "")])).toString();
  } else body = JSON.stringify(fields);
  ctx.body = body ?? "";
  ctx.path = path;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(body !== undefined ? { "Content-Type": enc === "form" ? "application/x-www-form-urlencoded" : "application/json" } : {}),
  };
  for (const [k, v] of Object.entries(op.headers ?? {})) headers[k] = String(render(v, ctx));

  const hide = [...Object.values(secret), token ?? "", ...Object.entries(headers).filter(([k]) => /auth|key|token|sign/i.test(k)).map(([, v]) => v)];
  const started = Date.now();
  let http: number | null = null;
  let text = "";
  let result: CallResult;
  try {
    const res = await fetch(url, { method: op.method, headers, body, signal: AbortSignal.timeout(cfg.timeoutMs ?? 20_000), cache: "no-store" });
    http = res.status;
    text = await res.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {}
    const { outcome, message } = readOutcome(op, kind, http, data);
    const m = op.map ?? {};
    const num = (p?: string) => (p ? Number(readPath(data, p)) : undefined);
    result = {
      outcome,
      httpStatus: http,
      message,
      supplierOrderId: m.orderId ? String(readPath(data, m.orderId) ?? "") || undefined : undefined,
      codes: asCodes(op, data),
      balance: m.balance ? num(m.balance) : undefined,
      currency: m.currency ? String(readPath(data, m.currency) ?? "") || undefined : undefined,
      token: m.token ? String(readPath(data, m.token) ?? "") || undefined : undefined,
      expiresIn: m.expiresIn ? num(m.expiresIn) : undefined,
      raw: text,
    };
  } catch (e) {
    result = { outcome: "UNKNOWN", httpStatus: null, message: e instanceof Error ? e.message : "Request failed", codes: [], raw: "" };
  }
  // Codes are secret too: never stored in the log.
  const logHide = [...hide, ...result.codes.flatMap((c) => [c.code, c.pin ?? "", c.serial ?? ""]), result.token ?? ""];
  await prisma.supplierLog
    .create({
      data: {
        supplierId: s.id,
        supplierOrderId,
        op: kind,
        request: redact(`${op.method} ${url}\n${Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${body ?? ""}`, logHide),
        response: redact(text || result.message || "", logHide),
        httpStatus: http,
        ms: Date.now() - started,
        outcome: result.outcome,
      },
    })
    .catch((e) => console.error("supplier log failed", e));
  return result;
}

/** One call to a supplier operation, with login token handled and the request logged (secrets and codes removed). */
export async function callSupplier(supplierId: string, kind: OpName, extra: Ctx = {}, supplierOrderId: string | null = null): Promise<CallResult> {
  const s = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });
  const cfg = s.config as unknown as SupplierConfig;
  const secret = secretsOf(s);
  const token = kind === "token" ? undefined : await ensureToken(s, cfg, secret);
  const r = await callRaw(s, cfg, kind, extra, secret, token, supplierOrderId);
  if (r.httpStatus === 401 && token) {
    // Token expired early: forget it so the next call logs in again.
    await prisma.supplier.update({ where: { id: s.id }, data: { tokenEncrypted: null, tokenExpiresAt: null } });
  }
  if (kind === "balance" && r.balance !== undefined && Number.isFinite(r.balance)) {
    await prisma.supplier.update({ where: { id: s.id }, data: { balance: r.balance, balanceCurrency: r.currency ?? null, balanceAt: new Date() } });
  }
  return r;
}
