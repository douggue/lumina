"use client";
import { PhotoPicker } from "./PhotoPicker";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { retryMoncash, submitOrderNatcash } from "@/actions/wallet";
import { CopyButton } from "./CopyButton";
import { PhoneInput } from "./PhoneInput";
import { formatPhone } from "@/lib/phone";

export function NatcashOrderForm({ orderId, phone, methodName }: { orderId: string; phone: string; methodName?: string }) {
  const to = useTranslations("order");
  const tc = useTranslations("common");
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-4 space-y-3"
      // onSubmit (not action) so what the customer typed stays in the fields if something goes wrong
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          setError("");
          const r = await submitOrderNatcash(fd).catch(() => ({ ok: false as const, error: "network" }));
          if (r.ok) return router.refresh();
          if (r.error === "not_found") return router.refresh(); // already sent, or the order changed: show its current state
          setError(r.error === "duplicate_ref" ? to("duplicateRef") : r.error === "reference" ? to("referenceBad") : tc("error"));
        });
      }}
    >
      <input type="hidden" name="orderId" value={orderId} />
      <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
        <span className="flex-1 font-mono font-semibold">{formatPhone(phone) || phone}</span>
        <CopyButton value={phone.replace(/\s/g, "")} label={to("copy")} done={to("copied")} />
      </div>
      <div>
        <label className="label" htmlFor="reference">{methodName ? to("reference").replace("NatCash", methodName) : to("reference")}</label>
        <input id="reference" name="reference" required minLength={4} maxLength={40} placeholder={to("referencePlaceholder")} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="payerPhone">{to("payerPhone")}</label>
        <PhoneInput id="payerPhone" name="payerPhone" />
      </div>
      <PhotoPicker name="evidence" label={to("evidence")} />
      {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p>}
      <button className="btn-primary w-full sm:w-auto" disabled={pending}>{pending ? tc("loading") : to("submitProof")}</button>
    </form>
  );
}

export function MoncashRetryButton({ orderId }: { orderId: string }) {
  const to = useTranslations("order");
  const tc = useTranslations("common");
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <div>
      <button
        type="button"
        className="btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await retryMoncash(orderId);
            if (r.ok) window.location.href = r.redirect;
            else setError(tc("error"));
          })
        }
      >
        {pending ? tc("loading") : to("payMoncash")}
      </button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
