import { createHash, createHmac, randomUUID } from "node:crypto";

/**
 * Tiny template language for supplier requests: `{{path | filter | filter:arg}}`.
 * Paths read the context (`ref`, `secret.apiKey`, `fields.playerId`…). Filter arguments are context paths too
 * (`hmac_sha256:secret.secret`), or text in quotes (`hmac_sha256:'abc'`).
 */
export type Ctx = Record<string, unknown>;

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".").filter(Boolean)) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

const hash = (algo: string) => (v: string) => createHash(algo).update(v, "utf8").digest("hex");
const hmac = (algo: string) => (v: string, key: string) => createHmac(algo, key).update(v, "utf8").digest("hex");

/** "a=1&b=2" with keys sorted, empty values skipped (SEAGM-style signatures) */
function sortedQuery(v: unknown): string {
  if (!v || typeof v !== "object") return String(v ?? "");
  return Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== undefined && x !== null && x !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, x]) => `${k}=${typeof x === "object" ? JSON.stringify(x) : String(x)}`)
    .join("&");
}

const FILTERS: Record<string, (v: unknown, arg: string) => string> = {
  md5: (v) => hash("md5")(str(v)),
  sha1: (v) => hash("sha1")(str(v)),
  sha256: (v) => hash("sha256")(str(v)),
  hmac_sha256: (v, k) => hmac("sha256")(str(v), k),
  hmac_sha1: (v, k) => hmac("sha1")(str(v), k),
  hmac_sha256_base64: (v, k) => createHmac("sha256", k).update(str(v), "utf8").digest("base64"),
  base64: (v) => Buffer.from(str(v), "utf8").toString("base64"),
  upper: (v) => str(v).toUpperCase(),
  lower: (v) => str(v).toLowerCase(),
  urlencode: (v) => encodeURIComponent(str(v)),
  json: (v) => JSON.stringify(v ?? null),
  sorted_query: (v) => sortedQuery(v),
  append: (v, a) => str(v) + a,
  prepend: (v, a) => a + str(v),
};

function str(v: unknown): string {
  if (v === undefined || v === null) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

function argValue(raw: string, ctx: Ctx): string {
  const a = raw.trim();
  if (/^'.*'$/.test(a) || /^".*"$/.test(a)) return a.slice(1, -1);
  return str(getPath(ctx, a));
}

/** Split on "|" outside quotes */
function pipes(expr: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q: string | null = null;
  for (const ch of expr) {
    if (q) {
      if (ch === q) q = null;
    } else if (ch === "'" || ch === '"') q = ch;
    else if (ch === "|") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function evaluate(expr: string, ctx: Ctx): unknown {
  const [head, ...filters] = pipes(expr);
  let v: unknown = /^'.*'$/.test(head) ? head.slice(1, -1) : getPath(ctx, head);
  for (const f of filters) {
    const i = f.indexOf(":");
    const name = (i < 0 ? f : f.slice(0, i)).trim();
    const fn = FILTERS[name];
    if (!fn) throw new Error(`Unknown filter "${name}"`);
    v = fn(v, i < 0 ? "" : argValue(f.slice(i + 1), ctx));
  }
  return v;
}

/** Render a template string. A template that is exactly one `{{…}}` keeps the value's type (numbers, objects). */
export function render(tpl: string, ctx: Ctx): unknown {
  const whole = /^\{\{([^{}]+)\}\}$/.exec(tpl.trim());
  if (whole) return evaluate(whole[1], ctx);
  return tpl.replace(/\{\{([^{}]+)\}\}/g, (_, e: string) => str(evaluate(e, ctx)));
}

/** Render a body value: "#…" → number, "?…" → true/false, objects and arrays recursively. */
export function renderValue(v: unknown, ctx: Ctx): unknown {
  if (typeof v === "string") {
    if (v.startsWith("#")) return Number(render(v.slice(1), ctx));
    if (v.startsWith("?")) return ["1", "true", "yes"].includes(String(render(v.slice(1), ctx)).toLowerCase());
    return render(v, ctx);
  }
  if (Array.isArray(v)) return v.map((x) => renderValue(x, ctx));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, renderValue(x, ctx)]));
  return v;
}

/** Values every request can use */
export function baseContext(): Ctx {
  const now = Date.now();
  return { timestamp: Math.floor(now / 1000), timestamp_ms: now, uuid: randomUUID(), iso_time: new Date(now).toISOString() };
}

/**
 * Read a JSON path in a reply: "a.b", "a[0].b", "items[*].codes[*]" (every element, flattened).
 * Returns a list when the path has [*], else a single value.
 */
export function readPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+|\*)\]/g, ".$1").split(".").filter(Boolean);
  let cur: unknown[] = [obj];
  let many = false;
  for (const p of parts) {
    const next: unknown[] = [];
    for (const c of cur) {
      if (c == null || typeof c !== "object") continue;
      if (p === "*") {
        many = true;
        if (Array.isArray(c)) next.push(...c);
        else next.push(...Object.values(c));
      } else next.push((c as Record<string, unknown>)[p]);
    }
    cur = next.filter((x) => x !== undefined);
  }
  return many ? cur : cur[0];
}
