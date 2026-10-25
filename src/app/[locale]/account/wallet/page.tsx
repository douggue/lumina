import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getBalances } from "@/lib/ledger";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { moncashAvailable } from "@/lib/payments/moncash";
import { getManualMethods } from "@/lib/manual-methods";
import { mustVerifyEmail } from "@/lib/verify-email";
import { PageBar } from "@/components/PageBar";
import { DepositForm } from "@/components/DepositForm";
import { VerifyGate } from "@/components/VerifyGate";
import { StatusBadge } from "@/components/StatusBadge";

/** Wallet (mockup "Bous mwen"): balance card, add funds (amount + payment method), recent movements. */
export default async function WalletPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const [tw, tu, balances, s, manual, verify, entries, pending] = await Promise.all([
    getTranslations("wallet"),
    getTranslations("walletUi"),
    getBalances(prisma, user.id),
    getSettings(),
    getManualMethods(locale, "deposits"),
    mustVerifyEmail(user.id),
    prisma.ledgerEntry.findMany({
      where: { account: { userId: user.id, currency: "HTG" } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { transaction: true, account: { select: { type: true } } },
    }),
    prisma.paymentIntent.findMany({ where: { userId: user.id, orderId: null, status: { in: ["PENDING", "REVIEW", "REJECTED"] } }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const runningOrders = await prisma.order.aggregate({ where: { userId: user.id, status: { in: ["PAID", "PROCESSING"] } }, _sum: { total: true } });
  const inProgress = runningOrders._sum.total ?? 0;
  const label = (e: (typeof entries)[number]) => {
    const n = e.transaction.description.match(/#(\d+)/)?.[1];
    if (n && e.transaction.type === "PURCHASE") return tu("orderN", { n });
    if (n && e.transaction.type === "REFUND") return tu("refundN", { n });
    return tw(`tx.${e.transaction.type}`);
  };
  return (
    <>
      <PageBar title={tu("title")} />
      <div className="mx-auto flex max-w-[560px] flex-col gap-[18px] px-5 py-[18px]">
        <section className="relative flex flex-col gap-1.5 overflow-hidden rounded-[20px] bg-[#0F172A] p-5 text-white">
          <div aria-hidden className="absolute -bottom-[50px] -right-[30px] h-[140px] w-[140px] rounded-full bg-[#00209F]" />
          <div aria-hidden className="absolute -bottom-[70px] right-[50px] h-[110px] w-[110px] rounded-full bg-[#D21034]" />
          <span className="relative text-[13px] text-[#CBD5E1]">{tu("balance")}</span>
          <span className="relative text-[34px] font-extrabold tracking-tight">{formatMoney(balances.HTG.available, "HTG", locale)}</span>
          {inProgress > 0 && <span className="relative text-xs text-[#CBD5E1]">{tu("held", { amount: formatMoney(inProgress, "HTG", locale) })}</span>}
          {balances.HTG.held > 0 && <span className="relative text-xs text-[#CBD5E1]">{tu("heldDeposit", { amount: formatMoney(balances.HTG.held, "HTG", locale) })}</span>}
        </section>

        {verify ? (
          <VerifyGate email={user.email} />
        ) : (
          <DepositForm
            moncash={moncashAvailable(s.moncashEnabled)}
            natcash={s.natcashEnabled}
            natcashName={s.natcashRecipientName}
            natcashPhone={s.natcashRecipientPhone}
            natcashQr={s.natcashQrUrl}
            manual={manual}
            minHtg={s.minDepositHtg}
            maxHtg={s.maxDepositHtg}
            htgPerUsd={s.htgPerUsd}
          />
        )}

        {pending.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-base font-bold">{tu("pending")}</h2>
            {pending.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 border-b border-border py-2.5 text-sm">
                <span>
                  <span className="font-semibold">{p.provider}</span> · {formatMoney(p.amount, p.currency, locale)}
                  {p.status === "REJECTED" && p.reviewNote && <span className="block text-xs text-danger">{p.reviewNote}</span>}
                </span>
                <StatusBadge status={p.status} label={tw(`depositStatus.${p.status}`)} />
              </div>
            ))}
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">{tu("recent")}</h2>
          {entries.length === 0 && <p className="py-4 text-sm text-muted">{tu("noHistory")}</p>}
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 border-b border-border py-2.5">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold">{label(e)}</span>
                <span className="text-xs text-muted">{e.createdAt.toLocaleDateString(locale === "fr" ? "fr-FR" : "fr-HT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </span>
              <span className={`flex-none text-sm font-bold ${e.amount > 0 ? "text-[#166534] dark:text-success" : "text-text"}`}>
                {e.amount > 0 ? "+ " : "− "}{formatMoney(Math.abs(e.amount), e.currency, locale)}
              </span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
