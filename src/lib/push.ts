import "server-only";
import webpush from "web-push";
import { prisma } from "./db";

type Keys = { publicKey: string; privateKey: string };
const KEY = "vapidKeys"; // not in DEFAULT_SETTINGS, so getSettings() never returns it

let cached: Promise<Keys> | null = null;

/**
 * VAPID keys for Web Push. Vercel env vars win (NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY);
 * otherwise a pair is made once and kept in the database, so push works with nothing to set up.
 */
export function vapidKeys(): Promise<Keys> {
  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return Promise.resolve({ publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY });
  }
  cached ??= (async () => {
    const row = await prisma.siteSetting.findUnique({ where: { key: KEY } });
    if (row) return row.value as Keys;
    const fresh = webpush.generateVAPIDKeys();
    // Two servers racing on the first push: the first write wins and both use it.
    await prisma.siteSetting.createMany({ data: [{ key: KEY, value: { ...fresh } }], skipDuplicates: true });
    return (await prisma.siteSetting.findUniqueOrThrow({ where: { key: KEY } })).value as Keys;
  })().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}

export type PushMessage = { title: string; body: string; url: string; tag?: string };

/** Sends to every device the customer turned notifications on for. Dead subscriptions are removed. Never throws. */
export async function sendPush(userId: string, msg: PushMessage) {
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    if (!subs.length) return;
    const keys = await vapidKeys();
    const options = { vapidDetails: { subject: process.env.VAPID_SUBJECT || "mailto:support@haitiviral.com", ...keys }, TTL: 60 * 60 * 24, urgency: "high" as const };
    const payload = JSON.stringify(msg);
    await Promise.all(
      subs.map((s) =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, options).catch(async (e: { statusCode?: number }) => {
          if (e.statusCode === 404 || e.statusCode === 410) await prisma.pushSubscription.deleteMany({ where: { id: s.id } });
          else console.error("push failed", e.statusCode ?? e);
        }),
      ),
    );
  } catch (e) {
    console.error("push failed", e);
  }
}
