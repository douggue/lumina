"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateProfile } from "@/actions/account";
import { localeNames, locales, type Locale } from "@/i18n/routing";
import { CITIES } from "@/lib/cities";
import { PhoneInput } from "./PhoneInput";

export function ProfileForm({ user }: { user: { name: string; email: string; phone: string; locale: string; displayCurrency: string; city: string; showInFeed: boolean } }) {
  const tp = useTranslations("profile");
  const ta = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="card mt-6 space-y-4 p-5 sm:p-6"
      action={(fd) =>
        start(async () => {
          const r = await updateProfile(fd);
          setMsg(r.ok ? tp("saved") : tc("error"));
          if (r.ok) router.replace("/account/profile", { locale: fd.get("locale") as Locale });
        })
      }
    >
      <div>
        <label className="label" htmlFor="name">{ta("name")}</label>
        <input id="name" name="name" defaultValue={user.name} required maxLength={80} className="input" />
      </div>
      <div>
        <span className="label">{ta("email")}</span>
        <p className="input flex items-center bg-surface-2 text-muted">{user.email}</p>
      </div>
      <div>
        <label className="label" htmlFor="phone">{ta("phone")}</label>
        <PhoneInput id="phone" name="phone" defaultValue={user.phone} />
      </div>
      <div>
        <label className="label" htmlFor="city">{tp("city")}</label>
        <select id="city" name="city" defaultValue={user.city} className="input">
          <option value="">{tp("cityNone")}</option>
          {CITIES.map((c) => <option key={c.name} value={c.name}>{c.flag} {c.name}</option>)}
        </select>
      </div>
      <label className="flex items-start gap-3 rounded-xl bg-surface-2 p-3 text-sm">
        <input type="checkbox" name="showInFeed" defaultChecked={user.showInFeed} className="mt-0.5 h-5 w-5 accent-[var(--primary)]" />
        <span>
          <b className="block">{tp("showInFeed")}</b>
          <span className="text-muted">{tp("showInFeedHint")}</span>
        </span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="locale">{tp("language")}</label>
          <select id="locale" name="locale" defaultValue={user.locale} className="input">
            {locales.map((l) => <option key={l} value={l}>{localeNames[l]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="displayCurrency">{tp("currency")}</label>
          <select id="displayCurrency" name="displayCurrency" defaultValue={user.displayCurrency} className="input">
            <option value="HTG">HTG</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>
      {msg && <p className="text-sm text-success" role="status">{msg}</p>}
      <button className="btn-primary" disabled={pending}>{tc("save")}</button>
    </form>
  );
}
