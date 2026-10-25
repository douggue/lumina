import { NextResponse } from "next/server";
import { verifyInboundCode, whatsappVerifyEnabled } from "@/lib/whatsapp-verify";

export const dynamic = "force-dynamic";

/**
 * Meta WhatsApp Cloud API webhook.
 * GET: hub challenge (META_WHATSAPP_VERIFY_TOKEN).
 * POST: inbound messages — if body text matches a pending PhoneVerification code, mark verified.
 * Stub-safe: when tokens missing, GET returns 503; POST no-ops with 200 so Meta retries don't storm.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.META_WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  if (!whatsappVerifyEnabled()) return NextResponse.json({ ok: false, reason: "wa_off" }, { status: 503 });
  return NextResponse.json({ ok: false }, { status: 403 });
}

export async function POST(req: Request) {
  if (!whatsappVerifyEnabled()) return NextResponse.json({ ok: true, stub: true });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    const entries = (body as { entry?: unknown[] })?.entry ?? [];
    for (const entry of entries) {
      const changes = (entry as { changes?: unknown[] })?.changes ?? [];
      for (const ch of changes) {
        const value = (ch as { value?: { messages?: { from?: string; type?: string; text?: { body?: string } }[] } })?.value;
        for (const msg of value?.messages ?? []) {
          if (msg.type === "text" && msg.from && msg.text?.body) {
            await verifyInboundCode(msg.from, msg.text.body);
          }
        }
      }
    }
  } catch (e) {
    console.error("whatsapp webhook", e);
  }
  // Always 200 to Meta once accepted.
  return NextResponse.json({ ok: true });
}
