import "server-only";
import { randomInt } from "node:crypto";
import { prisma } from "./db";
import { normalizePhone } from "./phone";

/** Feature on when Meta Cloud API tokens are present, a display number is set, or WA_VERIFY_STUB=1. */
export function whatsappVerifyEnabled() {
  if (process.env.WA_VERIFY_STUB === "1") return true;
  if (process.env.META_WHATSAPP_DISPLAY_NUMBER || process.env.NEXT_PUBLIC_WA_VERIFY_NUMBER) return true;
  return !!(process.env.META_WHATSAPP_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID && process.env.META_WHATSAPP_VERIFY_TOKEN);
}

const CODE_TTL_MS = 15 * 60_000;

function genCode() {
  return String(randomInt(100000, 999999));
}

/** Issue (or refresh) a code the customer must send to our WhatsApp Business number. */
export async function issuePhoneCode(userId: string, rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new Error("phone");
  const code = genCode();
  const row = await prisma.phoneVerification.create({
    data: { userId, phone, code, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });
  const waNumber = process.env.META_WHATSAPP_DISPLAY_NUMBER || process.env.NEXT_PUBLIC_WA_VERIFY_NUMBER || "";
  // Click-to-chat: customer sends the code to us (inbound is free on Meta).
  const clickToChat = waNumber
    ? `https://wa.me/${waNumber.replace(/\D/g, "")}?text=${encodeURIComponent(`Lumina verify ${code}`)}`
    : null;
  return { phone, code, expiresAt: row.expiresAt, clickToChat, stub: process.env.WA_VERIFY_STUB === "1" };
}

/** Mark verified when an inbound WhatsApp message matches a pending code. */
export async function verifyInboundCode(fromPhone: string, text: string) {
  const phone = normalizePhone(fromPhone) || fromPhone.replace(/\D/g, "");
  const code = (text || "").replace(/\D/g, "").slice(0, 8);
  if (!phone || code.length < 4) return null;
  const row = await prisma.phoneVerification.findFirst({
    where: { phone: { endsWith: phone.slice(-8) }, code, verifiedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  // Also try exact normalized match
  const exact = row ?? (await prisma.phoneVerification.findFirst({
    where: { phone, code, verifiedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  }));
  if (!exact) return null;
  return prisma.phoneVerification.update({ where: { id: exact.id }, data: { verifiedAt: new Date() } });
}

/** True if this user+phone has a recent verified inbound code. */
export async function isPhoneVerified(userId: string, phone: string, maxAgeMs = 24 * 3_600_000) {
  const since = new Date(Date.now() - maxAgeMs);
  const row = await prisma.phoneVerification.findFirst({
    where: { userId, phone, verifiedAt: { gte: since } },
    orderBy: { verifiedAt: "desc" },
  });
  return !!row;
}
