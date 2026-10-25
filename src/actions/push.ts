"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertUser } from "@/lib/session";
import { sendPush, vapidKeys } from "@/lib/push";
import { getTranslations } from "next-intl/server";

type R = { ok: true } | { ok: false; error: string };

// Only real browser push services: our server sends to this URL, so anything else would be a way to make it call other sites.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/, /^android\.googleapis\.com$/];

const subSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(1000)
    .refine((u) => {
      const url = new URL(u);
      return url.protocol === "https:" && PUSH_HOSTS.some((h) => h.test(url.hostname));
    }),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

export async function pushPublicKey(): Promise<string> {
  return (await vapidKeys()).publicKey;
}

/** Saves this device for push. `test` sends a first "it works" notification. */
export async function savePushSubscription(raw: unknown, test = true): Promise<R> {
  try {
    const user = await assertUser();
    const parsed = subSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const { endpoint, keys } = parsed.data;
    const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
    if ((await prisma.pushSubscription.count({ where: { userId: user.id } })) >= 10) {
      const oldest = await prisma.pushSubscription.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
      if (oldest) await prisma.pushSubscription.delete({ where: { id: oldest.id } });
    }
    // Same phone, new account signed in: the device now belongs to that account.
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
      update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    });
    if (test) {
      const t = await getTranslations({ locale: user.locale ?? "ht", namespace: "pwa" });
      await sendPush(user.id, { title: "HaitiViral", body: t("welcome"), url: `/${user.locale ?? "ht"}/account/notifications`, tag: "welcome" });
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "error" };
  }
}

export async function removePushSubscription(endpoint: string): Promise<R> {
  try {
    const user = await assertUser();
    await prisma.pushSubscription.deleteMany({ where: { userId: user.id, endpoint: String(endpoint).slice(0, 1000) } });
    return { ok: true };
  } catch {
    return { ok: false, error: "error" };
  }
}
