import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { setTicketStatus, staffReply } from "@/actions/admin";
import { ActionButton, ActionForm } from "@/components/admin/ActionButton";
import { PageTitle } from "@/components/admin/ui";
import { formatPhone, waNumber } from "@/lib/phone";

export const metadata = { title: "Support request" };

const TEMPLATES = [
  "Mèsi, nou resevwa demann ou. N ap tcheke sa kounye a.",
  "Kòmand ou fini. Tanpri verifye kont ou (li dwe piblik) epi fè nou konnen.",
  "Founisè a ap travay sou kòmand ou. Vitès la ka chanje lè sèvis la chaje, tanpri tann kèk èdtan ankò.",
  "Nou voye yon refill bay founisè a. L ap kòmanse nan kèk èdtan.",
  "Nou bezwen nimewo referans NatCash la pou n ka verifye peman an.",
  "Nou ranbouse lajan an nan bous HaitiViral ou.",
];

export default async function TicketAdmin({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("support.manage");
  const { id } = await params;
  const t = await prisma.supportTicket.findUnique({ where: { id }, include: { user: true, messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } } } });
  if (!t) notFound();
  const order = t.orderId ? await prisma.order.findUnique({ where: { id: t.orderId }, select: { id: true, number: true, status: true } }) : null;
  return (
    <>
      <PageTitle title={`#${t.number} ${t.subject}`} sub={`${t.status.replace("_", " ")} · opened ${t.createdAt.toLocaleString("en-US")}`} actions={
        t.status === "CLOSED" ? <ActionButton label="Reopen" action={setTicketStatus.bind(null, t.id, "OPEN")} /> : <ActionButton label="Close" action={setTicketStatus.bind(null, t.id, "CLOSED")} />
      } />
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-3">
          {t.messages.map((m) => (
            <div key={m.id} className={`rounded-2xl p-4 text-sm ${m.fromStaff ? "ml-8 bg-primary-soft" : "mr-8 border border-border bg-surface"}`}>
              <p className="mb-1 text-xs font-semibold text-muted">{m.fromStaff ? `Staff · ${m.author.name}` : t.user.name} · {m.createdAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</p>
              <p className="whitespace-pre-wrap">{m.body}</p>
              {m.attachmentPath && <a href={`/api/support/attachment/${m.id}`} target="_blank" className="mt-2 inline-block text-xs font-semibold text-primary">📎 Screenshot</a>}
            </div>
          ))}
          <ActionForm action={staffReply} className="card space-y-3 p-4" resetOnSuccess>
            <input type="hidden" name="ticketId" value={t.id} />
            <textarea name="message" rows={4} required className="input py-2" placeholder={`Reply in ${t.user.locale.toUpperCase()}…`} />
            <details className="text-xs text-muted"><summary className="cursor-pointer">Quick replies (Kreyòl)</summary><ul className="mt-2 space-y-1">{TEMPLATES.map((x) => <li key={x} className="select-all">{x}</li>)}</ul></details>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="close" /> Close after replying</label>
              <button className="btn-primary min-h-10">Send reply</button>
            </div>
          </ActionForm>
        </div>
        <aside className="card h-fit space-y-2 p-5 text-sm">
          <h2 className="font-semibold">Customer</h2>
          <Link href={`/admin/customers/${t.userId}`} className="font-medium text-primary">{t.user.name}</Link>
          <p className="text-muted">{t.user.email}{t.user.phone ? ` · ${formatPhone(t.user.phone)}` : ""} · {t.user.locale.toUpperCase()}</p>
          {t.user.phone && <a href={`https://wa.me/${waNumber(t.user.phone)}`} target="_blank" className="inline-block text-[#1fa855]">WhatsApp ↗</a>}
          {order && <p>Order: <Link href={`/admin/orders/${order.id}`} className="text-primary">#{order.number}</Link> ({order.status})</p>}
        </aside>
      </div>
    </>
  );
}
