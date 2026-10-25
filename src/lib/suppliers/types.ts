/**
 * How a supplier's API is described (Supplier.config). Every text value is a template:
 * `{{ref}}`, `{{sku}}`, `{{quantity}}`, `{{fields.playerId}}`, `{{secret.apiKey}}`, `{{token}}`, `{{timestamp}}`,
 * `{{body}}` (the encoded body, for signatures), `{{params}}` (the other body fields, for sorted signatures)…
 * piped through filters: `{{secret.key | md5}}`, `{{body | hmac_sha256:secret.secret | upper}}`. See template.ts.
 */
export type Encoding = "json" | "form" | "query";

export type Operation = {
  method: "GET" | "POST" | "PUT";
  /** Appended to the supplier's base URL (or a full https:// address); may contain templates */
  path: string;
  encoding?: Encoding;
  headers?: Record<string, string>;
  /** Body (or query) fields. Values are templates; "123" style numbers stay text unless prefixed with "#" (number) or "?" (true/false) */
  body?: Record<string, unknown>;
  /** Fields computed after the body (signatures that cover the other fields) */
  signed?: Record<string, string>;
  /** Where to read things in the reply (JSON paths like "data.order.id" or "items[*].codes[*]") */
  map?: {
    orderId?: string;
    status?: string;
    message?: string;
    /** List of codes, or of objects with code/pin/serial fields */
    codes?: string;
    code?: string;
    pin?: string;
    serial?: string;
    expiry?: string;
    balance?: string;
    currency?: string;
    token?: string;
    expiresIn?: string;
  };
  /** Supplier status value (case-insensitive) → our meaning */
  statusMap?: Record<string, Outcome>;
  /** When status isn't mapped: reply counts as an error if this path is present / true */
  errorPath?: string;
  /** What a 2xx reply without a known status means: SUCCESS (synchronous suppliers) or PENDING ("accepted", check later) */
  okOutcome?: "SUCCESS" | "PENDING";
};

export type Outcome = "SUCCESS" | "PENDING" | "FAILED";

export type SupplierConfig = {
  /** Names of the secrets this supplier needs (shown as fields in Admin) */
  secrets: string[];
  /** Login step for suppliers that hand out tokens; the token is cached until it expires */
  token?: Operation;
  order: Operation;
  status?: Operation;
  /** Some suppliers return codes on a separate call after success */
  codes?: Operation;
  balance?: Operation;
  /** What the callback URL replies, e.g. {"status":"success"} or "success" */
  callbackReply?: string;
  timeoutMs?: number;
  notes?: string;
};

export type DeliveredCode = { code: string; pin?: string; serial?: string; expiry?: string };

/** Result of one call, after reading the reply */
export type CallResult = {
  outcome: Outcome | "UNKNOWN";
  httpStatus: number | null;
  supplierOrderId?: string;
  message?: string;
  codes: DeliveredCode[];
  balance?: number;
  currency?: string;
  token?: string;
  expiresIn?: number;
  raw: string;
};
