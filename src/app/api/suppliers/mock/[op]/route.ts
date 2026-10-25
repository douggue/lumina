import { NextResponse, type NextRequest } from "next/server";
import { mockSupplierAllowed } from "@/lib/suppliers/mock";

/**
 * Fake supplier for tests (preset "mock"). The product code decides what happens:
 * OK-CODE delivers a code, OK-TOPUP delivers without a code, PENDING is "processing" until checked,
 * FAIL is refused, TIMEOUT answers too late (the order is then found by the status check), ERROR is a server error.
 */
async function handle(req: NextRequest, op: string) {
  if (!mockSupplierAllowed()) return new NextResponse("not found", { status: 404 });
  if (req.headers.get("x-api-key") !== "mock-key") return NextResponse.json({ message: "bad key" }, { status: 401 });
  if (op === "balance") return NextResponse.json({ balance: 1234.5, currency: "USD" });
  const b = (await req.json().catch(() => ({}))) as { ref?: string; sku?: string; quantity?: number; player?: string };
  const ref = String(b.ref ?? "");
  const qty = Math.max(1, Number(b.quantity) || 1);
  const codes = Array.from({ length: qty }, (_, i) => `MOCK-${ref.slice(-6).toUpperCase()}-${i + 1}`);
  const done = (withCodes: boolean) => NextResponse.json({ order_id: `M-${ref}`, status: "completed", codes: withCodes ? codes : [] });
  switch (b.sku) {
    case "OK-CODE":
      return done(true);
    case "OK-TOPUP":
      return done(false);
    case "PENDING":
      return op === "status" ? done(true) : NextResponse.json({ order_id: `M-${ref}`, status: "processing" });
    case "FAIL":
      return NextResponse.json({ status: "failed", message: "Invalid player ID" });
    case "TIMEOUT":
      if (op === "status") return done(true);
      await new Promise((r) => setTimeout(r, 3000));
      return done(true);
    case "ERROR":
      return new NextResponse("Internal Server Error", { status: 500 });
    default:
      return NextResponse.json({ status: "failed", message: `Unknown product ${b.sku}` });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ op: string }> }) {
  return handle(req, (await params).op);
}
export async function GET(req: NextRequest, { params }: { params: Promise<{ op: string }> }) {
  return handle(req, (await params).op);
}
