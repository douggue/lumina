import { redirect } from "next/navigation";

/** Short referral link haitiviral.com/r/CODE: opens the public referral page; the code is remembered (middleware). */
export default async function ShortReferral({ params }: { params: Promise<{ locale: string; code: string }> }) {
  const { locale, code } = await params;
  redirect(`/${locale}/referral?ref=${encodeURIComponent(code.toUpperCase().replace(/[^A-Z0-9]/g, ""))}`);
}
