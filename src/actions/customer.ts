"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verify } from "@node-rs/argon2";
import { prisma } from "@/lib/db";
import { assertUser } from "@/lib/session";
import { getBalances } from "@/lib/ledger";
import { parseMeta } from "@/lib/services";
import { requestSmmCancel, requestSmmRefill } from "@/lib/suppliers/smm-orders";
import { audit } from "@/lib/audit";
import { savePrivateImage, uploadsEnabled } from "@/lib/storage";

type R = { ok: true; id?: string } | { ok: false; error: string };

// ───────────── Support tickets ─────────────

async function attachment(form: FormData) {
  const file = form.get("attachment");
  if (file instanceof File && file.size > 0 && uploadsEnabled()) return savePrivateImage(file, "support");
  return null;
}

export async function createTicket(form: FormData): Promise<R> {
  const user = await assertUser();
  const subject = String(form.get("subject") ?? "").trim().slice(0, 120);
  const body = String(form.get("message") ?? "").trim().slice(0, 5000);
  const orderId = String(form.get("orderId") ?? "") || null;
  if (subject.length < 3 || body.length < 5) return { ok: false, error: "missing" };
  const open = await prisma.supportTicket.count({ where: { userId: user.id, status: { not: "CLOSED" } } });
  if (open >= 5) return { ok: false, error: "too_many" };
  if (orderId && !(await prisma.order.findFirst({ where: { id: orderId, userId: user.id } }))) return { ok: false, error: "missing" };
  let path: string | null = null;
  try {
    path = await attachment(form);
  } catch {
    return { ok: false, error: "upload" };
  }
  const ticket = await prisma.supportTicket.create({
    data: { userId: user.id, subject, orderId, messages: { create: { authorId: user.id, body, attachmentPath: path } } },
  });
  revalidatePath("/[locale]/account/support", "page");
  return { ok: true, id: ticket.id };
}

export async function replyTicket(form: FormData): Promise<R> {
  const user = await assertUser();
  const ticketId = String(form.get("ticketId"));
  const body = String(form.get("message") ?? "").trim().slice(0, 5000);
  if (body.length < 1) return { ok: false, error: "missing" };
  const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, userId: user.id } });
  if (!ticket) return { ok: false, error: "missing" };
  let path: string | null = null;
  try {
    path = await attachment(form);
  } catch {
    return { ok: false, error: "upload" };
  }
  await prisma.$transaction([
    prisma.supportMessage.create({ data: { ticketId, authorId: user.id, body, attachmentPath: path } }),
    prisma.supportTicket.update({ where: { id: ticketId }, data: { status: "OPEN" } }),
  ]);
  revalidatePath(`/[locale]/account/support/${ticketId}`, "page");
  return { ok: true };
}

// ───────────── Notification preferences ─────────────

export async function savePrefs(form: FormData): Promise<R> {
  const user = await assertUser();
  const prefs = { email: form.get("email") === "on", whatsapp: form.get("whatsapp") === "on", marketing: form.get("marketing") === "on" };
  await prisma.user.update({ where: { id: user.id }, data: { notifyPrefs: prefs } });
  return { ok: true };
}

// ───────────── Saved cart ─────────────

const cartLine = z.object({
  key: z.string().max(400),
  variantId: z.string().max(64),
  productSlug: z.string().max(120),
  productName: z.record(z.string().max(200)),
  variantName: z.record(z.string().max(200)),
  accent: z.string().max(20).nullable().optional(),
  image: z.string().max(500).nullable().optional(),
  priceHtg: z.number().int().nonnegative(),
  quantity: z.number().int().min(1).max(10),
  fields: z.record(z.string().max(200)),
  amount: z.number().int().positive().optional(),
  priceUsd: z.number().int().nonnegative().optional(),
});

/** The cart follows the customer across devices. Prices are re-checked on the server at checkout anyway. */
/** Cart saved on the account, with the time it last changed (so an older device can't bring removed items back). */
type SavedCart = { lines: z.infer<typeof cartLine>[]; updatedAt: number };

function readSaved(raw: unknown): SavedCart {
  // Older accounts stored just the list of lines.
  const obj = Array.isArray(raw) ? { lines: raw, updatedAt: 0 } : ((raw ?? {}) as { lines?: unknown; updatedAt?: unknown });
  const lines = z.array(cartLine).max(20).safeParse(obj.lines ?? []);
  return { lines: lines.success ? lines.data : [], updatedAt: Number(obj.updatedAt) || 0 };
}

export async function saveCart(lines: unknown, updatedAt: number): Promise<R> {
  const user = await assertUser();
  const parsed = z.array(cartLine).max(20).safeParse(lines);
  if (!parsed.success || !Number.isFinite(updatedAt)) return { ok: false, error: "invalid" };
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { savedCart: true } });
  // A device with an older cart never overwrites a newer one.
  if (readSaved(row?.savedCart).updatedAt > updatedAt) return { ok: false, error: "stale" };
  await prisma.user.update({ where: { id: user.id }, data: { savedCart: { lines: parsed.data, updatedAt: Math.min(updatedAt, Date.now() + 60_000) } } });
  return { ok: true };
}

export async function getSavedCart(): Promise<SavedCart> {
  try {
    const user = await assertUser();
    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { savedCart: true } });
    return readSaved(row?.savedCart);
  } catch {
    return { lines: [], updatedAt: 0 };
  }
}

// ───────────── Account deletion ─────────────

/**
 * Erases personal data (name, email, phone, sign-in methods) and closes the account.
 * Orders, payments and ledger entries stay for accounting, linked to the anonymous account.
 */
export async function deleteAccount(password: string): Promise<R> {
  const user = await assertUser();
  const account = await prisma.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
  if (account?.password) {
    if (!(await verify(account.password, password).catch(() => false))) return { ok: false, error: "wrongPassword" };
  } else if (password.trim().toLowerCase() !== user.email.toLowerCase()) {
    // Signed up with Google (no password): the account's email confirms instead.
    return { ok: false, error: "wrongPassword" };
  }
  const b = await getBalances(prisma, user.id);
  if (b.HTG.available + b.HTG.held + b.USD.available + b.USD.held > 0) return { ok: false, error: "deleteBalance" };
  const busy =
    (await prisma.order.count({ where: { userId: user.id, status: { in: ["AWAITING_PAYMENT", "PAYMENT_REVIEW", "PAID", "PROCESSING"] } } })) +
    (await prisma.paymentIntent.count({ where: { userId: user.id, status: { in: ["PENDING", "REVIEW"] } } }));
  if (busy > 0) return { ok: false, error: "deletePending" };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { name: "Deleted user", email: `deleted+${user.id}@deleted.invalid`, phone: null, status: "CLOSED", savedCart: { lines: [], updatedAt: Date.now() }, image: null, referralCode: null, emailVerified: false },
    }),
    prisma.account.deleteMany({ where: { userId: user.id } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.twoFactor.deleteMany({ where: { userId: user.id } }),
    prisma.savedPlayerId.deleteMany({ where: { userId: user.id } }),
    prisma.notification.deleteMany({ where: { userId: user.id } }),
  ]);
  await audit(user.id, "account.delete", "User", user.id);
  return { ok: true };
}

/**
 * Fix a mistyped email before it is confirmed (the lock screen offers this). A confirmed email is changed by support only.
 * At most 3 changes a day, and the new address must not belong to another account.
 */
export async function changeUnverifiedEmail(newEmail: string, callbackURL: string): Promise<R> {
  const user = await assertUser();
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { email: true, emailVerified: true } });
  if (!row) return { ok: false, error: "generic" };
  if (row.emailVerified) return { ok: false, error: "already_verified" };
  const parsed = z.string().trim().toLowerCase().email().max(200).safeParse(newEmail);
  if (!parsed.success) return { ok: false, error: "invalid_email" };
  const email = parsed.data;
  if (email === row.email) return { ok: true };
  const since = new Date(Date.now() - 86_400_000);
  const recent = await prisma.auditEvent.count({ where: { actorId: user.id, action: "email.change_unverified", createdAt: { gte: since } } });
  if (recent >= 3) return { ok: false, error: "too_many" };
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return { ok: false, error: "email_taken" };
  await prisma.user.update({ where: { id: user.id }, data: { email } });
  await audit(user.id, "email.change_unverified", "User", user.id, { from: row.email, to: email });
  const { auth } = await import("@/lib/auth");
  const back = callbackURL.startsWith("/") && !callbackURL.startsWith("//") ? callbackURL : "/";
  try {
    await auth.api.sendVerificationEmail({ body: { email, callbackURL: back } });
  } catch (e) {
    console.error("verification email after change failed", e);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

// ───────────── Refill / cancel requests (handled by staff until the provider connector does it) ─────────────

export async function requestOrderHelp(orderId: string, kind: "refill" | "cancel"): Promise<{ ok: true; how: "provider" | "ticket" } | { ok: false; error: string }> {
  const user = await assertUser();
  const order = await prisma.order.findFirst({ where: { id: orderId, userId: user.id }, include: { items: { take: 1, include: { variant: { select: { service: true } } } } } });
  if (!order || !["refill", "cancel"].includes(kind)) return { ok: false, error: "missing" };
  const item = order.items[0];
  // Linked to an SMM provider: ask the provider directly. Otherwise (or if the provider says no) staff gets a ticket.
  if (item) {
    if (kind === "refill") {
      const r = await requestSmmRefill(item.id, parseMeta(item.variant.service)?.refillDays ?? 0);
      if (r === "sent") return { ok: true, how: "provider" };
      if (r === "expired" || r === "too_soon") return { ok: false, error: r };
    } else {
      if (order.status !== "PROCESSING" && order.status !== "PAID") return { ok: false, error: "missing" };
      const r = await requestSmmCancel(item.id);
      if (r === "sent") return { ok: true, how: "provider" };
    }
  }
  const subject = `${kind === "refill" ? "Refill" : "Cancel"} #${order.number}`;
  const existing = await prisma.supportTicket.findFirst({ where: { userId: user.id, orderId, subject, status: { not: "CLOSED" } } });
  if (existing) return { ok: true, how: "ticket" };
  await prisma.supportTicket.create({
    data: { userId: user.id, subject, orderId, messages: { create: { authorId: user.id, body: kind === "refill" ? "Customer asked for a refill from My orders." : "Customer asked to cancel from My orders." } } },
  });
  return { ok: true, how: "ticket" };
}

/** Account screen switch: promotions on/off (other notification preferences unchanged). */
export async function setMarketing(on: boolean): Promise<R> {
  const user = await assertUser();
  const current = ((await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { notifyPrefs: true } })).notifyPrefs ?? {}) as Record<string, boolean>;
  await prisma.user.update({ where: { id: user.id }, data: { notifyPrefs: { ...current, marketing: !!on } } });
  return { ok: true };
}

/** Help page: find one of the customer's own orders by its number. */
export async function lookupOrder(number: number): Promise<{ ok: true; id: string; number: number; status: string; total: number; name: unknown; quantity: string | null; createdAt: string } | { ok: false; error: string }> {
  let user;
  try {
    user = await assertUser();
  } catch {
    return { ok: false, error: "signin" };
  }
  if (!Number.isInteger(number) || number <= 0) return { ok: false, error: "missing" };
  const o = await prisma.order.findFirst({ where: { userId: user.id, number }, include: { items: { take: 1 } } });
  if (!o) return { ok: false, error: "missing" };
  const fv = (o.items[0]?.fieldValues ?? {}) as Record<string, string>;
  return { ok: true, id: o.id, number: o.number, status: o.status, total: o.total, name: o.items[0]?.productName ?? null, quantity: fv.quantity ?? null, createdAt: o.createdAt.toISOString() };
}
