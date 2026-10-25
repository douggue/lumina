"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { WhatsAppIcon } from "./Icons";
import { Turnstile, turnstileOn } from "./Turnstile";

/** With email configured: sends a reset link. Without: hands the customer to WhatsApp support (staff send a one-time link). */
export function ForgotForm({ emailEnabled, whatsappNumber }: { emailEnabled: boolean; whatsappNumber: string }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [captcha, setCaptcha] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);

  const waText = encodeURIComponent(t("forgotWhatsappMessage", { email: email.trim() || "—" }));

  return (
    <div className="card mx-auto w-full max-w-md space-y-4 p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">{t("forgotTitle")}</h1>
      {emailEnabled ? (
        sent ? (
          <p className="rounded-xl bg-success-soft px-4 py-3 text-sm text-success" role="status">{t("forgotSent")}</p>
        ) : (
          <form
            method="post"
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const res = await authClient.requestPasswordReset({ email: email.trim().toLowerCase(), redirectTo: `/${locale}/auth/reset`, fetchOptions: { headers: { "x-turnstile-token": captcha } } });
              setBusy(false);
              setCaptcha("");
              setCaptchaKey((k) => k + 1);
              if ((res.error as { code?: string } | null)?.code === "CAPTCHA_FAILED") return setError(t("captcha"));
              if (res.error?.status === 429) return setError(t("tooMany"));
              setSent(true); // same answer whether or not the account exists
            }}
          >
            <p className="text-sm text-muted">{t("forgotIntro")}</p>
            <div>
              <label htmlFor="email" className="label">{t("email")}</label>
              <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Turnstile key={captchaKey} onToken={setCaptcha} locale={locale} />
            {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p>}
            <button className="btn-primary w-full" disabled={busy || !hydrated || (turnstileOn && !captcha)}>{busy ? tc("loading") : t("forgotSend")}</button>
          </form>
        )
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">{t("forgotWhatsappIntro")}</p>
          <div>
            <label htmlFor="email" className="label">{t("email")}</label>
            <input id="email" type="email" autoComplete="email" placeholder={t("emailPlaceholder")} className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <a href={`https://wa.me/${whatsappNumber}?text=${waText}`} target="_blank" rel="noopener" className="btn min-h-12 w-full bg-[#1fa855] text-white hover:bg-[#178a45]">
            <WhatsAppIcon /> {t("forgotWhatsappButton")}
          </a>
        </div>
      )}
      <Link href="/auth/login" className="block text-center text-sm font-semibold text-primary">{t("backToLogin")}</Link>
    </div>
  );
}
