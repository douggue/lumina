import "server-only";

/**
 * MonCash (Digicel) Business API adapter.
 * Without MONCASH_CLIENT_ID/SECRET it runs in mock mode (development only), so the full flow can be tested.
 */
const HOSTS = {
  sandbox: { api: "https://sandbox.moncashbutton.digicelgroup.com/Api", gateway: "https://sandbox.moncashbutton.digicelgroup.com/Moncash-middleware" },
  live: { api: "https://moncashbutton.digicelgroup.com/Api", gateway: "https://moncashbutton.digicelgroup.com/Moncash-middleware" },
};

export function moncashMode(): "mock" | "sandbox" | "live" {
  if (!process.env.MONCASH_CLIENT_ID || !process.env.MONCASH_CLIENT_SECRET) {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_PAYMENTS !== "1") {
      throw new Error("MonCash credentials are not configured");
    }
    return "mock";
  }
  return process.env.MONCASH_MODE === "live" ? "live" : "sandbox";
}

async function token(mode: "sandbox" | "live"): Promise<string> {
  const basic = Buffer.from(`${process.env.MONCASH_CLIENT_ID}:${process.env.MONCASH_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${HOSTS[mode].api}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: "scope=read,write&grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`MonCash auth failed (${res.status})`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

/** Start a payment. `reference` is our PaymentIntent id; amount is in HTG centimes. Returns the URL to redirect the customer to. */
export async function createMoncashPayment(reference: string, amountHtgMinor: number): Promise<string> {
  const mode = moncashMode();
  if (mode === "mock") return `/api/payments/moncash/mock?ref=${encodeURIComponent(reference)}`;
  const access = await token(mode);
  const res = await fetch(`${HOSTS[mode].api}/v1/CreatePayment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ amount: amountHtgMinor / 100, orderId: reference }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`MonCash CreatePayment failed (${res.status})`);
  const json = (await res.json()) as { payment_token?: { token: string } };
  if (!json.payment_token?.token) throw new Error("MonCash did not return a payment token");
  return `${HOSTS[mode].gateway}/Payment/Redirect?token=${json.payment_token.token}`;
}

export type MoncashPayment = { reference: string; transactionId: string; amountHtgMinor: number; payer?: string; successful: boolean };

/** Look up a payment by our reference (PaymentIntent id). Returns null if MonCash has no record yet. */
export async function retrieveByReference(reference: string, mockApproved?: boolean, mockAmount?: number): Promise<MoncashPayment | null> {
  const mode = moncashMode();
  if (mode === "mock") {
    if (!mockApproved) return null;
    return { reference, transactionId: `MOCK-${reference.slice(-10)}`, amountHtgMinor: mockAmount ?? 0, payer: "50900000000", successful: true };
  }
  const access = await token(mode);
  const res = await fetch(`${HOSTS[mode].api}/v1/RetrieveOrderPayment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ orderId: reference }),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`MonCash RetrieveOrderPayment failed (${res.status})`);
  const json = (await res.json()) as {
    payment?: { reference: string; transaction_id: string; cost: number; message: string; payer: string };
  };
  if (!json.payment) return null;
  return {
    reference: json.payment.reference,
    transactionId: String(json.payment.transaction_id),
    amountHtgMinor: Math.round(Number(json.payment.cost) * 100),
    payer: json.payment.payer,
    successful: json.payment.message?.toLowerCase() === "successful",
  };
}

/** Resolve a transactionId (from the return URL) to our reference. */
export async function retrieveByTransaction(transactionId: string): Promise<MoncashPayment | null> {
  const mode = moncashMode();
  if (mode === "mock") return null;
  const access = await token(mode);
  const res = await fetch(`${HOSTS[mode].api}/v1/RetrieveTransactionPayment`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ transactionId }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    payment?: { reference: string; transaction_id: string; cost: number; message: string; payer: string };
  };
  if (!json.payment) return null;
  return {
    reference: json.payment.reference,
    transactionId: String(json.payment.transaction_id),
    amountHtgMinor: Math.round(Number(json.payment.cost) * 100),
    payer: json.payment.payer,
    successful: json.payment.message?.toLowerCase() === "successful",
  };
}

/** MonCash is offered only when enabled in settings AND usable here (credentials set, or mock mode outside production). */
export function moncashAvailable(enabledInSettings: boolean): boolean {
  if (!enabledInSettings) return false;
  try {
    moncashMode();
    return true;
  } catch {
    return false;
  }
}
