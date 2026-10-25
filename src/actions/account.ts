"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertUser } from "@/lib/session";
import { isCity } from "@/lib/cities";
import { normalizePhone } from "@/lib/phone";

const profile = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).optional(),
  locale: z.enum(["ht", "fr"]),
  displayCurrency: z.enum(["HTG", "USD"]),
});

export async function updateProfile(form: FormData) {
  const user = await assertUser();
  const data = profile.safeParse(Object.fromEntries(form));
  if (!data.success) return { ok: false as const };
  const city = form.get("city");
  await prisma.user.update({
    where: { id: user.id },
    data: { ...data.data, phone: normalizePhone(data.data.phone) ?? (data.data.phone || null), city: isCity(city) ? city : null, showInFeed: form.get("showInFeed") === "on" },
  });
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function markNotificationsRead() {
  const user = await assertUser();
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}
