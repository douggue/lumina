"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { generateAccount2fa, refreshDeliveryCodes } from "@/actions/customer";
import { CopyButton } from "./CopyButton";

export type YtDeliveryLabels = {
  refreshCodes: string;
  refreshOk: string;
  refreshNone: string;
  gen2fa: string;
  pasteSecret: string;
  codeExpires: string;
  copy: string;
  copied: string;
  errors: {
    no_secret: string;
    bad_secret: string;
    not_ytseller: string;
    generic: string;
    missing: string;
    no_code: string;
    no_provider_id: string;
    status: string;
  };
};

function fill(template: string, vars: Record<string, string | number>) {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), template);
}

function errMsg(labels: YtDeliveryLabels, code: string) {
  const map = labels.errors as Record<string, string>;
  return map[code] ?? labels.errors.generic;
}

export function YtDeliveryTools({
  orderId,
  mode,
  codeItemIds,
  labels,
}: {
  orderId: string;
  mode: "sms" | "account";
  codeItemIds: { id: string }[];
  labels: YtDeliveryLabels;
}) {
  const router = useRouter();
  const [pendingRefresh, startRefresh] = useTransition();
  const [pending2fa, start2fa] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [secret, setSecret] = useState("");
  const [needSecret, setNeedSecret] = useState(false);
  const [totp, setTotp] = useState<{ code: string; expiresIn: number } | null>(null);

  useEffect(() => {
    if (!totp) return;
    if (totp.expiresIn <= 0) {
      setTotp(null);
      return;
    }
    const t = setTimeout(() => setTotp((cur) => (cur ? { ...cur, expiresIn: cur.expiresIn - 1 } : null)), 1000);
    return () => clearTimeout(t);
  }, [totp]);

  function onRefresh() {
    setNote(null);
    startRefresh(async () => {
      const r = await refreshDeliveryCodes(orderId);
      if (r.ok) {
        setNote({
          ok: true,
          text: r.added > 0 ? fill(labels.refreshOk, { added: r.added }) : labels.refreshNone,
        });
        router.refresh();
      } else {
        setNote({ ok: false, text: errMsg(labels, r.error) });
      }
    });
  }

  function on2fa() {
    setNote(null);
    start2fa(async () => {
      const r = await generateAccount2fa({
        orderId,
        codeItemId: codeItemIds[0]?.id,
        secret: secret.trim() || undefined,
      });
      if (r.ok) {
        setNeedSecret(false);
        setTotp({ code: r.code, expiresIn: r.expiresIn });
      } else if (r.error === "no_secret" || r.error === "no_code" || r.error === "bad_secret") {
        setNeedSecret(true);
        setNote({ ok: false, text: errMsg(labels, r.error) });
      } else {
        setNote({ ok: false, text: errMsg(labels, r.error) });
      }
    });
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border bg-surface-2 p-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary min-h-9 px-3 text-xs" disabled={pendingRefresh} onClick={onRefresh}>
          {pendingRefresh ? "…" : labels.refreshCodes}
        </button>
        {(mode === "account" || needSecret) && (
          <button type="button" className="btn-secondary min-h-9 px-3 text-xs" disabled={pending2fa} onClick={on2fa}>
            {pending2fa ? "…" : labels.gen2fa}
          </button>
        )}
      </div>

      {(needSecret || (mode === "account" && secret)) && (
        <label className="block">
          <span className="label text-xs">{labels.pasteSecret}</span>
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="input mt-1 font-mono text-sm"
            placeholder="ABCD EFGH …"
          />
        </label>
      )}

      {totp && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2">
          <div>
            <code className="font-mono text-2xl font-bold tracking-widest text-text">{totp.code}</code>
            <p className="text-xs text-muted">{fill(labels.codeExpires, { seconds: totp.expiresIn })}</p>
          </div>
          <CopyButton value={totp.code} label={labels.copy} done={labels.copied} />
        </div>
      )}

      {note && (
        <p className={`text-xs ${note.ok ? "text-success" : "text-danger"}`} role="status">
          {note.text}
        </p>
      )}
    </div>
  );
}
