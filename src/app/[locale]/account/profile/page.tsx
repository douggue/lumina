import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ProfileForm } from "@/components/ProfileForm";

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const u = await requireUser(locale);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
  const tp = await getTranslations("profile");
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{tp("title")}</h1>
      <ProfileForm user={{ name: user.name, email: user.email, phone: user.phone ?? "", locale: user.locale, displayCurrency: user.displayCurrency, city: user.city ?? "", showInFeed: user.showInFeed }} />
    </div>
  );
}
