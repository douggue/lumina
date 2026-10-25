import { prisma } from "./db";
import { emailEnabled } from "./email";
import { turnstileEnabled } from "./turnstile";
import { monitoringEnabled } from "./monitor";

/** Which outside services are configured. Booleans only, never the values. */
export function serviceStatus() {
  const moncashKeys = !!process.env.MONCASH_CLIENT_ID && !!process.env.MONCASH_CLIENT_SECRET;
  return {
    database: !!process.env.DATABASE_URL,
    authSecret: !!process.env.BETTER_AUTH_SECRET,
    encryptionKey: !!process.env.ENCRYPTION_KEY,
    blobStorage: !!process.env.BLOB_READ_WRITE_TOKEN || !!process.env.BLOB_STORE_ID,
    moncash: moncashKeys ? (process.env.MONCASH_MODE === "live" ? "live" : "sandbox") : "mock",
    email: emailEnabled(),
    turnstile: turnstileEnabled(),
    sentry: monitoringEnabled(),
    cronSecret: !!process.env.CRON_SECRET,
  };
}

export async function checkDatabase(): Promise<{ ok: boolean; ms: number; error?: string }> {
  const t = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, ms: Date.now() - t };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, error: e instanceof Error ? e.message.split("\n")[0].slice(0, 200) : "error" };
  }
}
