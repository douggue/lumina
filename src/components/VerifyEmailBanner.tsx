"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

export function VerifyEmailBanner({ email }: { email: string }) {
  const ta = useTranslations("account");
  const locale = useLocale();
  const [sent, setSent] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
      <span>{sent ? ta("verificationSent") : ta("emailUnverified")}</span>
      {!sent && (
        <button
          type="button"
          className="font-semibold underline"
          onClick={async () => {
            await authClient.sendVerificationEmail({ email, callbackURL: `/${locale}/account` });
            setSent(true);
          }}
        >
          {ta("resendVerification")}
        </button>
      )}
    </div>
  );
}
