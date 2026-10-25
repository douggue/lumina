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
  // Backend also gates via settings.trialRequirePhoneVerified inside requestTrial.
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
 * Start WhatsApp phone verify.
 * → { ok, code, waUrl, expiresAt } | { ok:false, error: signin|phone|wa_off }
 * Customer opens waUrl and SENDS the code; Meta webhook sets PhoneVerification.verifiedAt.
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
      const settings = await getSettings();
      const digits = String(settings.whatsappNumber || "").replace(/\D/g, "");
      if (!digits) return { ok: false, error: "wa_off" };
      waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(`Lumina verify ${r.code}`)}`;
    }
    return { ok: true, code: r.code, waUrl, expiresAt: r.expiresAt.toISOString() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "phone") return { ok: false, error: "phone" };
    if (msg === "wa_off") return { ok: false, error: "wa_off" };
    console.error("startWhatsAppVerify failed", e);
    return { ok: false, error: "phone" };
  }
}

/** Poll until Meta inbound webhook marked the code verified. Stays false until then (waiting UI). */
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
    return { ok: true, verified: await isPhoneVerified(user.id, phone) };
  } catch (e) {
    console.error("pollWhatsAppVerify failed", e);
    return { ok: true, verified: false };
  }
}
