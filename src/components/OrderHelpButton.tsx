"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { requestOrderHelp } from "@/actions/customer";

/** "Refill" / "Mande anile" on My orders: sent to the provider when the order is linked to one, otherwise to staff (a ticket). */
export function OrderHelpButton({ orderId, kind, label, className, children }: { orderId: string; kind: "refill" | "cancel"; label: string; className: string; children?: React.ReactNode }) {
  const t = useTranslations("ordersUi");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (note?.ok) return <p className="rounded-[10px] bg-[#DCFCE7] px-3 py-2.5 text-xs text-[#166534]">{note.text}</p>;
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <button
        type="button"
        disabled={pending}
        className={className}
        onClick={() =>
          start(async () => {
            const r = await requestOrderHelp(orderId, kind);
            if (r.ok) setNote({ ok: true, text: r.how === "ticket" ? t("requested") : kind === "refill" ? t("refillSent") : t("cancelSent") });
            else setNote({ ok: false, text: r.error === "expired" ? t("refillExpired") : r.error === "too_soon" ? t("refillTooSoon") : t("helpError") });
          })
        }
      >
        {children}
        {label}
      </button>
      {note && <p className="text-xs text-[#B91C1C]">{note.text}</p>}
    </div>
  );
}
