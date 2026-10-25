import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUser } from "@/lib/session";
import { can, isStaff } from "@/lib/permissions";
import { readPrivateFile } from "@/lib/storage";

/** Support screenshots: visible to the ticket owner and to support staff only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  const msg = await prisma.supportMessage.findUnique({ where: { id }, include: { ticket: { select: { userId: true } } } });
  if (!msg?.attachmentPath) return new NextResponse("Not found", { status: 404 });
  const staffOk = isStaff(user.role) && !!user.twoFactorEnabled && (user.role === "CUSTOM" ? (await prisma.user.findUnique({ where: { id: user.id }, include: { customRole: true } }))?.customRole?.permissions.includes("support.manage") : can(user.role, "support.manage"));
  if (msg.ticket.userId !== user.id && !staffOk) return new NextResponse("Forbidden", { status: 403 });
  const buf = await readPrivateFile(msg.attachmentPath);
  const ext = msg.attachmentPath.split(".").pop();
  return new NextResponse(new Uint8Array(buf), { headers: { "content-type": ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
