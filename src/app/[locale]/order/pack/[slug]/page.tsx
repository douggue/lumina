import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { getUser } from "@/lib/session";
import { getBalances } from "@/lib/ledger";
import { t as txt } from "@/lib/text";
import { formatMoney } from "@/lib/money";
import { linkExample } from "@/lib/services";
import { vipStatus } from "@/lib/vip";
import { loadPack } from "@/lib/packs";
import { PageBar } from "@/components/PageBar";
import { PackOrderForm } from "@/components/PackOrderForm";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const p = await loadPack(slug);
  return { title: p ? txt(p.product.name, locale) : "HaitiViral" };
}

/** Starter pack screen: what's inside, a profile link and/or video links (one per line), the split, and pay. */
export default async function PackOrderPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const pack = await loadPack(slug);
  if (!pack || !pack.lines.length) notFound();
  const [user, t] = await Promise.all([getUser(), getTranslations("packUi")]);
  const balance = user ? (await getBalances(prisma, user.id)).HTG.available : null;
  const vip = user ? await vipStatus(user.id) : null;
  const platform = pack.lines[0].platform;
  return (
    <>
      <PageBar title={txt(pack.product.name, locale)} back="/" backLabel={t("back")}
        right={balance !== null && <span className="rounded-full bg-primary-soft px-3 py-2 text-[13px] font-bold">{formatMoney(balance, "HTG", locale)}</span>} />
      <PackOrderForm
        slug={slug}
        signedIn={!!user}
        balance={balance}
        discount={vip?.level.discount ?? 0}
        price={pack.price}
        separate={pack.separate}
        discountPct={pack.config.discountPct}
        newOnly={pack.config.newOnly}
        maxVideos={pack.maxVideos}
        high={pack.lines.some((l) => l.meta.risk === "high")}
        available={pack.lines.every((l) => l.active)}
        profileExample={linkExample(platform, false)}
        videoExample={linkExample(platform, true)}
        lines={pack.lines.map((l) => ({ name: `${txt(l.productName, locale)} · ${txt(l.name, locale)}`, quantity: l.quantity, post: l.post, min: l.meta.min, avg: txt(l.meta.avg, locale) }))}
      />
    </>
  );
}
