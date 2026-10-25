"use server";
import { z } from "zod";
import { assertUser } from "@/lib/session";
import { createServiceOrder, OrderError } from "@/lib/orders";
import { InsufficientFundsError } from "@/lib/ledger";
import { LimitExceededError } from "@/lib/risk";
import { mustVerifyEmail } from "@/lib/verify-email";
import { createPackOrder } from "@/lib/packs";

const input = z.object({
  variantId: z.string().min(1).max(64),
  link: z.string().max(500),
  quantity: z.number().int().min(0).max(10_000_000),
  comments: z.string().max(100_000).optional(),
  username: z.string().max(60).optional(),
  durationMin: z.number().int().optional(),
  drip: z.boolean().optional(),
  acceptRisk: z.boolean().optional(),
  publicOk: z.boolean().optional(),
});

export type ServiceOrderResult = { ok: true; orderId: string } | { ok: false; error: string };

/** New order screen: one service, paid from the wallet. */
export async function placeServiceOrder(raw: unknown): Promise<ServiceOrderResult> {
  let user;
  try {
    user = await assertUser();
  } catch {
    return { ok: false, error: "signin" };
  }
  if (await mustVerifyEmail(user.id)) return { ok: false, error: "verify_email" };
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_field" };
  try {
    const order = await createServiceOrder({ userId: user.id, ...parsed.data });
    return { ok: true, orderId: order.id };
  } catch (e) {
    if (e instanceof OrderError) return { ok: false, error: e.code };
    if (e instanceof InsufficientFundsError) return { ok: false, error: "insufficient" };
    if (e instanceof LimitExceededError) return { ok: false, error: "new_account_limit" };
    console.error("placeServiceOrder failed", e);
    return { ok: false, error: "generic" };
  }
}

const packInput = z.object({
  slug: z.string().min(1).max(80),
  profileLink: z.string().max(500).optional(),
  videoLinks: z.string().max(10_000).optional(),
  publicOk: z.boolean().optional(),
  acceptRisk: z.boolean().optional(),
});

/** Starter pack screen: the whole pack, paid from the wallet, split into one order line per service and video. */
export async function placePackOrder(raw: unknown): Promise<ServiceOrderResult> {
  let user;
  try {
    user = await assertUser();
  } catch {
    return { ok: false, error: "signin" };
  }
  if (await mustVerifyEmail(user.id)) return { ok: false, error: "verify_email" };
  const parsed = packInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_field" };
  try {
    const order = await createPackOrder({ userId: user.id, ...parsed.data });
    return { ok: true, orderId: order.id };
  } catch (e) {
    if (e instanceof OrderError) return { ok: false, error: e.code };
    if (e instanceof InsufficientFundsError) return { ok: false, error: "insufficient" };
    if (e instanceof LimitExceededError) return { ok: false, error: "new_account_limit" };
    console.error("placePackOrder failed", e);
    return { ok: false, error: "generic" };
  }
}
