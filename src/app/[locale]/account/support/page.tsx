import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { StatusBadge } from "@/components/StatusBadge";
import { NewTicketForm } from "@/components/SupportForms";
import { WhatsAppIcon } from "@/components/Icons";

export default async function SupportPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ order?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const sp = await searchParams;
  const [t, fmt, settings, tickets, orders] = await Promise.all([
    getTranslations("support"),
    getFormatter(),
    getSettings(),
    prisma.supportTicket.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 50 }),
    prisma.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, number: true } }),
  ]);
  const tone = { OPEN: "PROCESSING", WAITING_CUSTOMER: "PENDING", CLOSED: "CANCELED" } as const;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("intro")}</p>
        <a href={`https://wa.me/${settings.whatsappNumber}`} target="_blank" rel="noopener" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1fa855]"><WhatsAppIcon width={16} height={16} /> {t("orWhatsapp")}</a>
      </div>
      <NewTicketForm orders={orders} defaultOrder={sp.order} />
      {tickets.length === 0 ? (
        <p className="card p-8 text-center text-sm text-muted">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {tickets.map((tk) => (
            <li key={tk.id}>
              <Link href={`/account/support/${tk.id}`} className="card lift flex flex-wrap items-center gap-3 p-4">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{tk.subject}</span>
                  <span className="text-xs text-muted">{t("ticket", { number: tk.number })} · {fmt.relativeTime(tk.updatedAt)}</span>
                </span>
                <StatusBadge status={tone[tk.status]} label={t(`status${tk.status}`)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
