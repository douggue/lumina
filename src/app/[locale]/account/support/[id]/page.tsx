import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { StatusBadge } from "@/components/StatusBadge";
import { ReplyForm } from "@/components/SupportForms";

export default async function TicketPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const ticket = await prisma.supportTicket.findFirst({ where: { id, userId: user.id }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!ticket) notFound();
  const [t, fmt] = await Promise.all([getTranslations("support"), getFormatter()]);
  const tone = { OPEN: "PROCESSING", WAITING_CUSTOMER: "PENDING", CLOSED: "CANCELED" } as const;
  return (
    <div className="space-y-5">
      <div>
        <Link href="/account/support" className="text-sm text-muted hover:text-text">← {t("back")}</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{ticket.subject}</h1>
          <StatusBadge status={tone[ticket.status]} label={t(`status${ticket.status}`)} />
        </div>
        <p className="text-sm text-muted">{t("ticket", { number: ticket.number })}</p>
      </div>
      <ol className="space-y-3">
        {ticket.messages.map((m) => (
          <li key={m.id} className={`max-w-[90%] rounded-2xl p-4 text-sm ${m.fromStaff ? "bg-surface border border-border" : "ml-auto bg-primary-soft"}`}>
            <p className="mb-1 text-xs font-semibold text-muted">{m.fromStaff ? t("team") : t("you")} · {fmt.dateTime(m.createdAt, { dateStyle: "medium", timeStyle: "short" })}</p>
            <p className="whitespace-pre-wrap">{m.body}</p>
            {m.attachmentPath && <a href={`/api/support/attachment/${m.id}`} target="_blank" className="mt-2 inline-block text-xs font-semibold text-primary">📎 {t("attach")}</a>}
          </li>
        ))}
      </ol>
      {ticket.status === "CLOSED" && <p className="text-sm text-muted">{t("closedNote")}</p>}
      <ReplyForm ticketId={ticket.id} />
    </div>
  );
}
