import { NextResponse, type NextRequest } from "next/server";
import { mockSupplierAllowed } from "@/lib/suppliers/mock";

/**
 * Fake SMM panel (API v2) for tests and previews: Admin → Suppliers → "Test SMM panel", API key "mock-key".
 * Nothing is stored: an order id holds the service, the time it was placed and the quantity, and its status follows the clock.
 * 101-103, 106-108: complete after a short time · 104: ends Partial (70 % delivered) · 105: ends Canceled · 199: refused.
 */
const SERVICES = [
  { service: 101, name: "TikTok Followers [Real | 30 Day Refill | 1-3K/Day]", category: "TikTok Followers", type: "Default", rate: "1.80", min: 100, max: 50000, refill: true, cancel: true, dripfeed: true, seconds: 60 },
  { service: 102, name: "TikTok Likes [No Refill | Instant]", category: "TikTok Likes", type: "Default", rate: "0.12", min: 50, max: 100000, refill: false, cancel: false, dripfeed: true, seconds: 20 },
  { service: 103, name: "TikTok Video Views [No Refill | 500K/Day]", category: "TikTok Views", type: "Default", rate: "0.03", min: 500, max: 1000000, refill: false, cancel: false, dripfeed: true, seconds: 10 },
  { service: 104, name: "Instagram Followers [No Refill | Speed 500-2K/Day]", category: "Instagram Followers", type: "Default", rate: "1.45", min: 100, max: 20000, refill: false, cancel: true, dripfeed: true, seconds: 60 },
  { service: 105, name: "YouTube Views [Retention | 30 Day Refill]", category: "YouTube Views", type: "Default", rate: "1.30", min: 500, max: 100000, refill: true, cancel: true, dripfeed: false, seconds: 30 },
  { service: 106, name: "TikTok Custom Comments [Speed 250-1K/Day]", category: "TikTok Comments", type: "Custom Comments", rate: "9.00", min: 5, max: 500, refill: false, cancel: false, dripfeed: false, seconds: 40 },
  { service: 107, name: "TikTok Live Stream Views [30 Minutes]", category: "TikTok Live", type: "Default", rate: "7.50", min: 50, max: 5000, refill: false, cancel: false, dripfeed: false, seconds: 15 },
  { service: 108, name: "Instagram Followers [Bot | Cheap | No Refill]", category: "Instagram Followers", type: "Default", rate: "0.40", min: 100, max: 50000, refill: false, cancel: false, dripfeed: false, seconds: 20 },
  { service: 109, name: "Google Custom Reviews [Canada | 30 Day Refill]", category: "Google Reviews", type: "Custom Comments", rate: "120.00", min: 5, max: 100, refill: true, cancel: false, dripfeed: false, seconds: 60 },
  { service: 199, name: "Disabled service (always refused)", category: "Test", type: "Default", rate: "1.00", min: 1, max: 1000, refill: false, cancel: false, dripfeed: false, seconds: 1 },
];

function state(id: string) {
  const [svc, at, qty] = id.split(".").map(Number);
  const s = SERVICES.find((x) => x.service === svc);
  if (!s || !at) return { error: "Incorrect order ID" };
  const elapsed = (Date.now() - at * 1000) / 1000;
  const start = 1000;
  // Like real panels: the charge is the full price while running, then only what was delivered.
  const charge = (n: number) => ((Number(s.rate) * n) / 1000).toFixed(4);
  if (elapsed < s.seconds) return { charge: charge(qty), start_count: String(start), status: elapsed < 3 ? "Pending" : "In progress", remains: String(Math.max(0, Math.round(qty * (1 - elapsed / s.seconds)))), currency: "USD" };
  if (svc === 104) return { charge: charge(qty - Math.round(qty * 0.3)), start_count: String(start), status: "Partial", remains: String(Math.round(qty * 0.3)), currency: "USD" };
  if (svc === 105) return { charge: "0", start_count: String(start), status: "Canceled", remains: String(qty), currency: "USD" };
  return { charge: charge(qty), start_count: String(start), status: "Completed", remains: "0", currency: "USD" };
}

export async function POST(req: NextRequest) {
  if (!mockSupplierAllowed()) return new NextResponse("not found", { status: 404 });
  const f = new URLSearchParams(await req.text());
  if (f.get("key") !== "mock-key") return NextResponse.json({ error: "Invalid API key" });
  switch (f.get("action")) {
    case "services":
      return NextResponse.json(SERVICES.map(({ seconds: _s, ...x }) => x));
    case "balance":
      return NextResponse.json({ balance: "184.2000", currency: "USD" });
    case "add": {
      const svc = Number(f.get("service"));
      const s = SERVICES.find((x) => x.service === svc);
      if (!s) return NextResponse.json({ error: "Incorrect service ID" });
      if (svc === 199) return NextResponse.json({ error: "Service is disabled" });
      if (!f.get("link")) return NextResponse.json({ error: "Bad link" });
      const qty = s.type === "Custom Comments" ? (f.get("comments") ?? "").split("\n").filter(Boolean).length : Number(f.get("quantity"));
      if (!qty || qty < s.min || qty > s.max) return NextResponse.json({ error: `Quantity must be between ${s.min} and ${s.max}` });
      return NextResponse.json({ order: `${svc}.${Math.floor(Date.now() / 1000)}.${qty}` });
    }
    case "status": {
      const many = f.get("orders");
      if (many) return NextResponse.json(Object.fromEntries(many.split(",").map((id) => [id, state(id)])));
      return NextResponse.json(state(f.get("order") ?? ""));
    }
    case "refill":
      return NextResponse.json(state(f.get("order") ?? "").error ? { error: "Incorrect order ID" } : { refill: `R${f.get("order")}` });
    case "refill_status":
      return NextResponse.json({ status: "Completed" });
    case "cancel":
      return NextResponse.json((f.get("orders") ?? "").split(",").map((order) => ({ order, cancel: state(order).error ? { error: "Incorrect order ID" } : 1 })));
    default:
      return NextResponse.json({ error: "Incorrect request" });
  }
}
