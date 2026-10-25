"use client";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { subscribeNewsletter } from "@/actions/site";
import { Turnstile } from "./Turnstile";

export function NewsletterForm() {
  const t = useTranslations("newsletter");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  if (done) return <p className="text-sm font-semibold text-success" role="status">{t("done")}</p>;
  return (
    <form
      className="flex max-w-md flex-col gap-2"
      action={(fd) =>
        start(async () => {
          if (fd.get("website")) return setDone(true); // honeypot: bots fill hidden fields
          const r = await subscribeNewsletter(String(fd.get("email")), locale, String(fd.get("cf-turnstile-response") ?? ""));
          if (r.ok) setDone(true);
          else setError(tc("error"));
        })
      }
    >
      <label className="text-sm font-semibold" htmlFor="nl-email">{t("title")}</label>
      <div className="flex gap-2">
        <input id="nl-email" name="email" type="email" required placeholder={t("placeholder")} className="input" />
        <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
        <button className="btn-primary shrink-0" disabled={pending}>{t("button")}</button>
      </div>
      <Turnstile locale={locale} />
      <p className="text-xs text-muted">{t("consent")}</p>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
