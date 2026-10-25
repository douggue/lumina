"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

export function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const t = useTranslations("twofa");
  const ta = useTranslations("auth");
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "password" | "scan">("idle");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [backup, setBackup] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <section className="card space-y-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{t("title")}</h2>
        <span className={`badge ${enabled ? "bg-success-soft text-success" : "bg-surface-2 text-muted"}`}>{enabled ? t("on") : t("off")}</span>
      </div>
      <p className="text-sm text-muted">{t("intro")}</p>
      {step === "idle" && <button type="button" className="btn-secondary" onClick={() => setStep("password")}>{enabled ? t("disable") : t("enable")}</button>}
      {step === "password" && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const password = String(new FormData(e.currentTarget).get("password"));
            if (enabled) {
              const r = await authClient.twoFactor.disable({ password });
              setBusy(false);
              if (r.error) return setError(ta("invalid"));
              setStep("idle");
              router.refresh();
              return;
            }
            const r = await authClient.twoFactor.enable({ password, method: "totp" });
            setBusy(false);
            if (r.error || !r.data || r.data.method !== "totp") return setError(ta("invalid"));
            setSecret(new URL(r.data.totpURI).searchParams.get("secret") ?? "");
            setBackup(r.data.backupCodes);
            setQr(await QRCode.toDataURL(r.data.totpURI, { margin: 1, width: 200 }));
            setStep("scan");
          }}
        >
          <label className="block"><span className="label">{t("password")}</span><input name="password" type="password" required autoComplete="current-password" className="input" /></label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button className="btn-primary" disabled={busy}>{enabled ? t("disable") : t("enable")}</button>
        </form>
      )}
      {step === "scan" && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const r = await authClient.twoFactor.verifyTotp({ code: String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "") });
            setBusy(false);
            if (r.error) return setError(t("invalid"));
            setStep("idle");
            router.refresh();
          }}
        >
          <p className="text-sm">{t("scan")}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR" width={200} height={200} className="rounded-lg bg-white p-2" />
          <p className="break-all font-mono text-xs text-muted">{secret}</p>
          <details className="rounded-xl bg-surface-2 p-3 text-sm" open>
            <summary className="cursor-pointer font-semibold">{t("backup")}</summary>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs">{backup.map((c) => <li key={c}>{c}</li>)}</ul>
          </details>
          <label className="block"><span className="label">{t("code")}</span><input name="code" inputMode="numeric" autoComplete="one-time-code" required className="input text-center text-xl tracking-[0.3em]" /></label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button className="btn-primary" disabled={busy}>{t("activate")}</button>
        </form>
      )}
    </section>
  );
}
