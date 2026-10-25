import { headers } from "next/headers";
import { prisma, type Tx } from "./db";

export async function audit(
  actorId: string | null,
  action: string,
  targetType: string,
  targetId?: string | null,
  metadata: Record<string, unknown> = {},
  db: Tx = prisma,
) {
  let ip: string | null = null;
  try {
    ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    // outside a request (scripts, jobs)
  }
  await db.auditEvent.create({
    data: { actorId, action, targetType, targetId: targetId ?? null, metadata: metadata as object, ip },
  });
}
