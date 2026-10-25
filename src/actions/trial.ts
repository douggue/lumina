"use server";
import { z } from "zod";
import { assertUser } from "@/lib/session";
import { requestTrial, TrialError } from "@/lib/trials";
import { mustVerifyEmail } from "@/lib/verify-email";
import { normalizePhone } from "@/lib/phone";
import { getSettings } from "@/lib/settings";
import { issuePhoneCode, isPhoneVerified, whatsappVerifyEnabled } from "@/lib/whatsapp-verify";

const input = z.object({ offer: z.string().max(40), link: z.string().max(500), phone: z.string().max(30) });

/** Free trial request (mockup "Eseye gratis"). Requires WhatsApp phone verify when that feature is on. */
export async function submitTrial(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  let user;
  try {
    user = await assertUser();
  } catch {
    return { ok: false, error: "signin" };
  }
  if (await mustVerifyEmail(user.id)) return { ok: false, error: "verify_email" };
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "link" };
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { ok: false, error: "phone" };
  if (whatsappVerifyEnabled() && !(await isPhoneVerified(user.id, phone))) {
    return { ok: false, error: "phone_verify" };
  }
  try {
    await requestTrial(user.id, { ...parsed.data, phone });
    return { ok: true };
  } catch (e) {
    if (e instanceof TrialError) return { ok: false, error: e.code };
    console.error("submitTrial failed", e);
    return { ok: false, error: "generic" };
  }
}

/**
 * Start WhatsApp phone verify — contract: startWhatsAppVerify({ phone }) → { code, waUrl, expiresAt }.
 * Customer opens waUrl and SENDS the code; Meta webhook (Backend) sets PhoneVerification.verifiedAt.
 */
export async function startWhatsAppVerify(
  raw: unknown,
): Promise<{ ok: true; code: string; waUrl: string; expiresAt: string } | { ok: false; error: string }> {
  let user;
  try {
    user = await assertUser();
  } catch {
    return { ok: false, error: "signin" };
  }
  const parsed = z.object({ phone: z.string().max(30) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "phone" };

  try {
    const r = await issuePhoneCode(user.id, parsed.data.phone);
    let waUrl = r.clickToChat;
    if (!waUrl) {
      // Fallback display number from store settings when Meta display env is empty.
      const settings = await getSettings();
      const digits = String(settings.whatsappNumber || "").replace(/\D/g, "");
      if (!digits) return { ok: false, error: "phone" };
      waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(r.code)}`;
    }
    return { ok: true, code: r.code, waUrl, expiresAt: r.expiresAt.toISOString() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "phone") return { ok: false, error: "phone" };
    // Feature off / DB not migrated yet — soft stub so UI can still be demoed locally.
    if (msg === "wa_off" || /phoneVerification|PhoneVerification|does not exist/i.test(String(e))) {
      const phone = normalizePhone(parsed.data.phone);
      if (!phone) return { ok: false, error: "phone" };
      const settings = await getSettings();
      const digits = String(settings.whatsappNumber || process.env.NEXT_PUBLIC_WA_VERIFY_NUMBER || "").replace(/\D/g, "") || "50900000000";
      const code = String(100000 + (Date.now() % 900000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      return {
        ok: true,
        code,
        waUrl: `https://wa.me/${digits}?text=${encodeURIComponent(code)}`,
        expiresAt,
      };
    }
    console.error("startWhatsAppVerify failed", e);
    return { ok: false, error: "phone" };
  }
}

/** Poll until Meta inbound webhook marked the code verified. */
export async function pollWhatsAppVerify(
  raw: unknown,
): Promise<{ ok: true; verified: boolean } | { ok: false; error: string }> {
  let user;
  try {
    user = await assertUser();
  } catch {
    return { ok: false, error: "signin" };
  }
  const parsed = z.object({ phone: z.string().max(30), code: z.string().max(12) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "phone" };
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { ok: false, error: "phone" };
  try {
    const verified = await isPhoneVerified(user.id, phone);
    return { ok: true, verified };
  } catch (e) {
    // Schema not migrated yet — keep waiting UI honest.
    console.error("pollWhatsAppVerify failed", e);
    return { ok: true, verified: false };
  }
}
