"use server";
import { z } from "zod";
import { assertUser } from "@/lib/session";
import { requestTrial, TrialError } from "@/lib/trials";
import { mustVerifyEmail } from "@/lib/verify-email";

const input = z.object({ offer: z.string().max(40), link: z.string().max(500), phone: z.string().max(30) });

/** Free trial request (mockup "Eseye gratis"). */
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
  try {
    await requestTrial(user.id, parsed.data);
    return { ok: true };
  } catch (e) {
    if (e instanceof TrialError) return { ok: false, error: e.code };
    console.error("submitTrial failed", e);
    return { ok: false, error: "generic" };
  }
}
