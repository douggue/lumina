import { notFound, permanentRedirect, redirect } from "next/navigation";
import { prisma } from "@/lib/db";

/** Unknown paths: apply a redirect from Admin → SEO if one matches, otherwise show 404. */
export default async function CatchAll({ params }: { params: Promise<{ locale: string; rest: string[] }> }) {
  const { locale, rest } = await params;
  const from = `/${rest.map(decodeURIComponent).join("/")}`.replace(/\/+$/, "");
  const rule = await prisma.redirectRule.findUnique({ where: { from } });
  if (!rule) notFound();
  await prisma.redirectRule.update({ where: { id: rule.id }, data: { hits: { increment: 1 } } });
  const dest = rule.to.startsWith("https://") ? rule.to : `/${locale}${rule.to === "/" ? "" : rule.to}`;
  if (rule.permanent) permanentRedirect(dest);
  redirect(dest);
}
