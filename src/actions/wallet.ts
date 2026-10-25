"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { parseAmount, usdToHtg } from "@/lib/money";
import { createMoncashPayment, moncashAvailable } from "@/lib/payments/moncash";
import { assertWithinNewAccountLimit, LimitExceededError } from "@/lib/risk";
import { addEvent } from "@/lib/orders";
import { savePrivateImage, uploadsEnabled } from "@/lib/storage";
import { normalizePhone } from "@/lib/phone";
import { mustVerifyEmail } from "@/lib/verify-email";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// Spaces are dropped (copied from an SMS: "TX 1234 5678"); dots, slashes and underscores are kept (some wallets use them).
const refSchema = z.string().transform((s) => s.replace(/\s+/g, "")).pipe(z.string().min(4).max(40).regex(/^[A-Za-z0-9._\/-]+$/));

/** The photo is optional: if it can't be stored, the payment still goes through for review (the reference is what's checked). */
async function saveEvidence(form: FormData): Promise<string | null> {
  const file = form.get("evidence");
  if (!(file instanceof File) || file.size === 0 || !uploadsEnabled()) return null;
  try {
    return await savePrivateImage(file, "evidence");
  } catch (e) {
    console.error("payment photo not saved", e);
    return null;
  }
}
const phoneSchema = z.string().max(30).optional().transform((v) => normalizePhone(v) ?? v?.trim().slice(0, 20));
/** EVM (0x + 64 hex) or Tron (64 hex) transaction hash */
const txHashSchema = z.string().trim().regex(/^(0x)?[0-9a-fA-F]{64}$/);

/** Start a wallet deposit. MonCash returns a redirect URL; NatCash records the customer's reference for review. */
export async function createDeposit(form: FormData): Promise<ActionResult<{ redirect?: string }>> {
  const user = await assertUser();
  const { verifyTurnstile } = await import("@/lib/turnstile");
  const { headers } = await import("next/headers");
  if (!(await verifyTurnstile(String(form.get("cf-turnstile-response") ?? ""), (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim()))) {
    return { ok: false, error: "captcha" };
  }
  if (await mustVerifyEmail(user.id)) return { ok: false, error: "verify_email" };
  const settings = await getSettings();
  const method = form.get("method");
  const amount = parseAmount(String(form.get("amount") ?? ""));
  // Crypto methods credit the USD wallet: the amount is in USD, limits are compared in HTG.
  const manual = method === "MANUAL" ? await prisma.manualMethod.findUnique({ where: { id: String(form.get("manualMethodId") ?? "") } }) : null;
  const currency = manual?.currency ?? "HTG";
  const amountHtg = amount ? (currency === "USD" ? usdToHtg(amount, settings.htgPerUsd) : amount) : 0;
  if (!amount || amountHtg < settings.minDepositHtg || amountHtg > settings.maxDepositHtg) return { ok: false, error: "amount" };

  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  try {
    await assertWithinNewAccountLimit(prisma, dbUser, amountHtg, settings);
  } catch (e) {
    if (e instanceof LimitExceededError) return { ok: false, error: "new_account_limit" };
    throw e;
  }

  if (method === "MONCASH") {
    if (!moncashAvailable(settings.moncashEnabled)) return { ok: false, error: "method_unavailable" };
    const intent = await prisma.paymentIntent.create({ data: { userId: user.id, provider: "MONCASH", amount, currency: "HTG" } });
    return { ok: true, redirect: await createMoncashPayment(intent.id, amount) };
  }

  if (method === "NATCASH" || method === "MANUAL") {
    let manualMethodId: string | null = null;
    if (method === "NATCASH" && !settings.natcashEnabled) return { ok: false, error: "method_unavailable" };
    if (method === "MANUAL") {
      const m = manual;
      if (!m || !m.isEnabled || !m.allowDeposits) return { ok: false, error: "method_unavailable" };
      manualMethodId = m.id;
    }
    const ref = (manual?.kind === "crypto" ? txHashSchema : refSchema).safeParse(form.get("reference"));
    if (!ref.success) return { ok: false, error: manual?.kind === "crypto" ? "tx_hash" : "reference" };
    const phone = phoneSchema.safeParse(form.get("payerPhone") ?? undefined);
    const evidencePath = await saveEvidence(form);
    try {
      await prisma.paymentIntent.create({
        data: {
          userId: user.id, provider: method, manualMethodId, amount, currency, status: "REVIEW",
          providerRef: manual?.kind === "crypto" ? ref.data.toLowerCase() : ref.data.toUpperCase(), payerPhone: phone.success ? phone.data || null : null, evidencePath,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "duplicate_ref" };
      throw e;
    }
    revalidatePath("/[locale]/account/wallet", "page");
    return { ok: true };
  }
  return { ok: false, error: "method_unavailable" };
}

/** Customer submits NatCash proof for an order awaiting payment. */
export async function submitOrderNatcash(form: FormData): Promise<ActionResult> {
  const user = await assertUser();
  const orderId = String(form.get("orderId"));
  const ref = refSchema.safeParse(form.get("reference"));
  if (!ref.success) return { ok: false, error: "reference" };
  const order = await prisma.order.findFirst({ where: { id: orderId, userId: user.id, paymentMethod: { in: ["NATCASH", "MANUAL"] }, status: "AWAITING_PAYMENT" } });
  if (!order) return { ok: false, error: "not_found" };
  const evidencePath = await saveEvidence(form);
  const phone = phoneSchema.safeParse(form.get("payerPhone") ?? undefined);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.paymentIntent.create({
        data: {
          userId: user.id, orderId: order.id, provider: order.paymentMethod === "MANUAL" ? "MANUAL" : "NATCASH", manualMethodId: order.manualMethodId, amount: order.total, currency: "HTG", status: "REVIEW",
          providerRef: ref.data.toUpperCase(), payerPhone: phone.success ? phone.data || null : null, evidencePath,
        },
      });
      await tx.order.update({ where: { id: order.id }, data: { status: "PAYMENT_REVIEW" } });
      await addEvent(tx, order.id, "PAYMENT_REVIEW", `${order.paymentMethod === "MANUAL" ? "Manual payment" : "NatCash"} reference ${ref.data.toUpperCase()}`);
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "duplicate_ref" };
    console.error("order payment proof failed", e);
    return { ok: false, error: "error" };
  }
  revalidatePath(`/[locale]/account/orders/${order.id}`, "page");
  return { ok: true };
}

/** Pay an unpaid MonCash order again (e.g. the customer canceled on the MonCash page). */
export async function retryMoncash(orderId: string): Promise<ActionResult<{ redirect: string }>> {
  const user = await assertUser();
  const order = await prisma.order.findFirst({ where: { id: orderId, userId: user.id, paymentMethod: "MONCASH", status: "AWAITING_PAYMENT" } });
  if (!order) return { ok: false, error: "not_found" };
  const intent = await prisma.paymentIntent.create({ data: { userId: user.id, orderId: order.id, provider: "MONCASH", amount: order.total, currency: "HTG" } });
  return { ok: true, redirect: await createMoncashPayment(intent.id, intent.amount) };
}
