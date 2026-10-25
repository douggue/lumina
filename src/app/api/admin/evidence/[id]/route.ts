import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertStaff } from "@/lib/session";
import { readPrivateFile } from "@/lib/storage";
import { audit } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let staff;
  try {
    staff = await assertStaff("payments.review");
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const { id } = await params;
  const intent = await prisma.paymentIntent.findUnique({ where: { id } });
  if (!intent?.evidencePath) return new NextResponse("Not found", { status: 404 });
  const buf = await readPrivateFile(intent.evidencePath);
  await audit(staff.id, "evidence.view", "PaymentIntent", id);
  const ext = intent.evidencePath.split(".").pop();
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return new NextResponse(new Uint8Array(buf), { headers: { "content-type": type, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
