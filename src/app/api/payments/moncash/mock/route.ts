import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { moncashMode } from "@/lib/payments/moncash";
import { getUser } from "@/lib/session";
import { formatMoney } from "@/lib/money";

/** Development stand-in for the MonCash payment page. Disabled whenever real credentials are configured. */
export async function GET(req: NextRequest) {
  if (moncashMode() !== "mock") return new NextResponse("Not found", { status: 404 });
  const ref = req.nextUrl.searchParams.get("ref") ?? "";
  const intent = await prisma.paymentIntent.findUnique({ where: { id: ref } });
  if (!intent) return new NextResponse("Unknown payment", { status: 404 });
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>MonCash (test)</title>
<style>body{font-family:system-ui;background:#f4f4f4;margin:0;display:grid;place-items:center;min-height:100vh}main{background:#fff;padding:28px;border-radius:16px;max-width:360px;width:90%;box-shadow:0 8px 30px #0002}h1{color:#e30613;margin:0 0 4px}p{color:#444}button{width:100%;padding:14px;border:0;border-radius:10px;font-size:16px;font-weight:700;margin-top:10px;cursor:pointer}.ok{background:#e30613;color:#fff}.no{background:#eee}</style></head>
<body><main><h1>MonCash</h1><p><b>Test mode.</b> No real money moves.</p><p>Amount: <b>${formatMoney(intent.amount, "HTG")}</b></p>
<form method="post"><input type="hidden" name="ref" value="${intent.id}"><button class="ok" name="action" value="approve">Approve payment</button><button class="no" name="action" value="cancel">Cancel</button></form></main></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function POST(req: NextRequest) {
  if (moncashMode() !== "mock") return new NextResponse("Not found", { status: 404 });
  const form = await req.formData();
  const ref = String(form.get("ref"));
  const intent = await prisma.paymentIntent.findUnique({ where: { id: ref } });
  const user = await getUser();
  if (!intent || !user || user.id !== intent.userId) return new NextResponse("Forbidden", { status: 403 });
  if (form.get("action") === "approve") {
    await prisma.auditEvent.create({ data: { action: "moncash.mock.approved", targetType: "PaymentIntent", targetId: intent.id, actorId: user.id } });
  }
  return NextResponse.redirect(new URL(`/api/payments/moncash/return?ref=${intent.id}`, req.nextUrl), 303);
}
