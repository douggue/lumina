import { NextResponse } from "next/server";
import { monitoringEnabled, reportError } from "@/lib/monitor";

const seen = new Map<string, { until: number; count: number }>();

/** Browser errors caught by the error pages are forwarded to Sentry (only when SENTRY_DSN is set). */
export async function POST(req: Request) {
  if (!monitoringEnabled()) return new NextResponse(null, { status: 204 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
  const now = Date.now();
  // Per-instance limit: 10 reports per IP per minute.
  const w = seen.get(ip);
  if (w && w.until > now) {
    if (++w.count > 10) return new NextResponse(null, { status: 204 });
  } else {
    if (seen.size > 5000) seen.clear();
    seen.set(ip, { until: now + 60_000, count: 1 });
  }
  const body = (await req.json().catch(() => null)) as { message?: string; stack?: string; digest?: string; path?: string } | null;
  if (!body?.message) return new NextResponse(null, { status: 204 });
  const err = new Error(String(body.message).slice(0, 1000));
  err.stack = String(body.stack ?? "").slice(0, 8000) || err.stack;
  await reportError(err, { source: "client", path: String(body.path ?? "").slice(0, 300), digest: body.digest?.slice(0, 50) });
  return new NextResponse(null, { status: 204 });
}
