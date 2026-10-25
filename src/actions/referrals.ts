"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertStaff, assertUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { getSettings, setSetting, type RefTier } from "@/lib/settings";
import { decidePayout, earningsToWallet, PayoutError, requestPayout } from "@/lib/referrals";
import { parseAmount } from "@/lib/money";
import { mustVerifyEmail } from "@/lib/verify-email";

type R = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): R => ({ ok: false, error: e instanceof Error ? e.message : "Unexpected error" });

/** Customer: withdraw referral earnings to MonCash / NatCash (staff send it). */
export async function withdrawEarnings(input: { amount: string; method: string; phone: string }): Promise<R> {
  const user = await assertUser();
  if (await mustVerifyEmail(user.id)) return { ok: false, error: "verify_email" };
  const amount = parseAmount(input.amount);
  if (!amount) return { ok: false, error: "min" };
  try {
    await requestPayout(user.id, { amount, method: input.method, phone: input.phone });
    revalidatePath("/[locale]/account/referrals", "page");
    return { ok: true };
  } catch (e) {
    if (e instanceof PayoutError) return { ok: false, error: e.code };
    throw e;
  }
}

/** Customer: move referral earnings into the wallet, at once (no minimum). */
export async function earningsToWalletAction(amountInput: string): Promise<R> {
  const user = await assertUser();
  const amount = parseAmount(amountInput);
  if (!amount) return { ok: false, error: "balance" };
  try {
    await earningsToWallet(user.id, amount);
    revalidatePath("/[locale]/account/referrals", "page");
    return { ok: true };
  } catch (e) {
    if (e instanceof PayoutError) return { ok: false, error: e.code };
    throw e;
  }
}

/** Staff: a withdrawal was sent (with the MonCash / NatCash reference) or is rejected (money back to earnings). */
export async function decidePayoutAction(id: string, sent: boolean, text: string): Promise<R> {
  try {
    const staff = await assertStaff("referrals.manage");
    if (sent && !text.trim()) return { ok: false, error: "Write the MonCash / NatCash transaction reference" };
    await decidePayout(id, sent, staff.id, text.trim() || `Rejected by ${staff.name}`);
    await audit(staff.id, sent ? "payout.sent" : "payout.reject", "Payout", id, { text: text.slice(0, 100) });
    revalidatePath("/admin/referrals");
    return { ok: true, message: sent ? "Marked as sent" : "Rejected, money back to the customer's earnings" };
  } catch (e) {
    return fail(e);
  }
}

/** Staff: block a referral (no more commission; pending ones canceled) or allow it again. */
export async function setReferralBlocked(id: string, blocked: boolean): Promise<R> {
  try {
    const staff = await assertStaff("referrals.manage");
    const r = await prisma.referral.update({ where: { id }, data: { status: blocked ? "REJECTED" : "PENDING", note: blocked ? `Blocked by ${staff.name}` : null } });
    if (blocked) await prisma.referralCommission.updateMany({ where: { referredId: r.referredId, status: "PENDING" }, data: { status: "CANCELED" } });
    await audit(staff.id, blocked ? "referral.block" : "referral.allow", "Referral", id);
    revalidatePath("/admin/referrals");
    return { ok: true, message: blocked ? "Blocked" : "Allowed" };
  } catch (e) {
    return fail(e);
  }
}

/** Staff: tiers (%, friends, order total), hold days, minimum withdrawal, how long a friend earns commission. */
export async function saveReferralSettings(form: FormData): Promise<R> {
  try {
    const staff = await assertStaff("settings.manage");
    const s = await getSettings();
    const num = (k: string) => Number(String(form.get(k) ?? "").replace(/[,\s]/g, ""));
    const tiers: RefTier[] = s.refTiers.map((t, i) => ({
      ...t,
      pct: Math.min(50, Math.max(0, Math.round(num(`pct${i}`)) || 0)),
      minActive: Math.max(0, Math.round(num(`active${i}`)) || 0),
      minVolume: Math.max(0, Math.round(num(`volume${i}`) * 100) || 0),
    }));
    if (tiers.some((t, i) => i > 0 && t.pct < tiers[i - 1].pct)) return { ok: false, error: "Each tier must pay at least as much as the one before" };
    await setSetting("refTiers", tiers);
    await setSetting("referralEnabled", form.get("referralEnabled") === "on");
    await setSetting("refHoldDays", Math.min(60, Math.max(0, Math.round(num("refHoldDays")) || 0)));
    await setSetting("refMinPayoutHtg", Math.max(100, Math.round(num("refMinPayout") * 100) || 100_000));
    await setSetting("refMonths", Math.min(120, Math.max(0, Math.round(num("refMonths")) || 0)));
    await audit(staff.id, "referral.settings", "SiteSetting", "refTiers", { tiers });
    revalidatePath("/admin/referrals");
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return fail(e);
  }
}
