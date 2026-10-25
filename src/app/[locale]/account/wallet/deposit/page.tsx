import { redirect } from "@/i18n/navigation";

/** Adding funds now lives on the wallet screen itself (mockup). */
export default async function DepositPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: "/account/wallet", locale });
}
