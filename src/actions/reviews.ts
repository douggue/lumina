"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertUser } from "@/lib/session";
import { isCity } from "@/lib/cities";
import { shortName } from "@/lib/trust";

/** Customer review after delivery. Goes to Admin → Trust as "pending"; staff choose what shows on the homepage. */
export async function submitReview(orderId: string, form: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await assertUser();
  const rating = Math.round(Number(form.get("rating")));
  const quote = String(form.get("quote") ?? "").trim().slice(0, 400);
  const city = form.get("city");
  if (!(rating >= 1 && rating <= 5)) return { ok: false, error: "rating" };
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId: user.id, status: "FULFILLED" },
    select: { id: true, review: { select: { id: true } }, items: { take: 1, select: { variant: { select: { productId: true } } } } },
  });
  if (!order) return { ok: false, error: "order" };
  if (order.review) return { ok: true };
  const saved = (await prisma.user.findUnique({ where: { id: user.id }, select: { city: true } }))?.city ?? null;
  if (isCity(city) && city !== saved) await prisma.user.update({ where: { id: user.id }, data: { city } });
  await prisma.review.create({
    data: {
      userId: user.id,
      orderId: order.id,
      productId: order.items[0]?.variant.productId ?? null,
      rating,
      quote,
      name: shortName(user.name),
      city: isCity(city) ? city : saved,
      locale: user.locale,
      source: "order",
    },
  });
  revalidatePath(`/account/orders/${orderId}`);
  return { ok: true };
}
