import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkDatabase, serviceStatus } from "@/lib/health";

export const dynamic = "force-dynamic";

/**
 * Uptime check. Public answer: { ok, db } with 200 or 503 — point an uptime monitor (e.g. UptimeRobot) here.
 * With `Authorization: Bearer $CRON_SECRET` it also lists configured services and queue sizes.
 */
export async function GET(req: Request) {
  const db = await checkDatabase();
  const status = db.ok ? 200 : 503;
  const headers = { "Cache-Control": "no-store" };
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: db.ok, db: db.ok ? "up" : "down" }, { status, headers });
  }
  let queues: Record<string, number> | null = null;
  if (db.ok) {
    const [paymentsToReview, ordersProcessing, openRisk, openTickets, lastAudit] = await Promise.all([
      prisma.paymentIntent.count({ where: { status: "REVIEW" } }),
      prisma.order.count({ where: { status: "PROCESSING" } }),
      prisma.riskFlag.count({ where: { status: "OPEN" } }),
      prisma.supportTicket.count({ where: { status: "OPEN" } }),
      prisma.auditEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);
    queues = { paymentsToReview, ordersProcessing, openRisk, openTickets, minutesSinceLastAdminAction: lastAudit ? Math.round((Date.now() - lastAudit.createdAt.getTime()) / 60000) : -1 };
  }
  return NextResponse.json(
    { ok: db.ok, db, services: serviceStatus(), queues, commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null, time: new Date().toISOString() },
    { status, headers },
  );
}
