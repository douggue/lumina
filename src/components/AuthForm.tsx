"use client";
import { Logo } from "./Logo";
import { LangSegment } from "./HeaderClient";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname as useRawPathname, useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { Turnstile, turnstileOn } from "./Turnstile";

export function AuthForm({ mode: firstMode, google = false }: { mode: "login" | "register"; google?: boolean }) {
  const t = useTranslations("auth");
  const tg = useTranslations("google");
  // Sign in ↔ create account switch in place (no page load): the address changes with history.pushState,
  // and the mode follows the address so the Back button works too.
  const rawPath = useRawPathname();
  const mode = rawPath?.endsWith("/auth/register") ? "register" : rawPath?.endsWith("/auth/login") ? "login" : firstMode;
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next");
  const [error, setError] = useState(sp.get("blocked") ? t("blocked") : sp.get("error") ? tg("error") : "");
  const [loading, setLoading] = useState(false);
  // Until JavaScript is ready the button stays disabled, so credentials are never sent by a native form submit.
  const [hydrated, setHydrated] = useState(false);
  const [totp, setTotp] = useState(false);
  const [useBackup, setUseBackup] = useState(false);
  const t2 = useTranslations("auth2");
  const tu = useTranslations("authUi");
  const [showPw, setShowPw] = useState(false);
  const [pw, setPw] = useState("");
  // Rough guide only; the server also rejects passwords found in data breaches.
  const score = !pw ? 0 : Math.min(4, (pw.length >= 8 ? 1 : 0) + (pw.length >= 12 ? 1 : 0) + (/[A-Z]/.test(pw) && /[a-z]/.test(pw) ? 1 : 0) + (/[\d\W]/.test(pw) ? 1 : 0));
  const scoreLabel = [tu("weak"), tu("weak"), tu("fair"), tu("good"), tu("strong")][score];
  useEffect(() => setHydrated(true), []);
  const [captcha, setCaptcha] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);

  const nextQs = next ? `?next=${encodeURIComponent(next)}` : "";
  function switchTo(e: React.MouseEvent, to: "login" | "register") {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (to === mode) return;
    setError("");
    window.history.pushState(null, "", `/${locale}/auth/${to}${nextQs}`);
    const [from, into] = to === "register" ? [t("loginTitle"), t("registerTitle")] : [t("registerTitle"), t("loginTitle")];
    document.title = document.title.replace(from, into);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email")).trim().toLowerCase();
    const password = String(f.get("password"));
    const fetchOptions = { headers: { "x-turnstile-token": captcha } };
    const res =
      mode === "login"
        ? await authClient.signIn.email({ email, password, fetchOptions })
        : await authClient.signUp.email({
            email,
            password,
            name: String(f.get("name")).trim(),
            locale,
            fetchOptions,
          } as Parameters<typeof authClient.signUp.email>[0]);
    setLoading(false);
    if (res.error) {
      const { status, code } = res.error as { status: number; code?: string };
      // Turnstile tokens work once: get a fresh one for the next try.
      setCaptcha("");
      setCaptchaKey((k) => k + 1);
      if (code === "CAPTCHA_FAILED") setError(t("captcha"));
      else if (status === 429) setError(t("tooMany"));
      else if (code === "ACCOUNT_BLOCKED" || status === 403) setError(t("blocked"));
      else if (code === "PASSWORD_COMPROMISED") setError(t("compromised"));
      // Same message whether or not the email is registered, so the form can't be used to look up accounts.
      else if (mode === "register") setError(t("signupFailed"));
      else setError(t("invalid"));
      return;
    }
    if ((res.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
      setTotp(true);
      return;
    }
    goNext();
  }

  function goNext() {
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
    router.push(safeNext.replace(/^\/(ht|fr)(?=\/|$)/, "") || "/account");
    router.refresh();
  }

  async function onTotp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
    const r = useBackup ? await authClient.twoFactor.verifyBackupCode({ code }) : await authClient.twoFactor.verifyTotp({ code });
    setLoading(false);
    if (r.error) return setError(r.error.status === 429 ? t("tooMany") : t("invalid"));
    goNext();
  }

  if (totp) {
    return (
      <form method="post" onSubmit={onTotp} className="card mx-auto w-full max-w-md space-y-4 p-6 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight">{t2("totpTitle")}</h1>
        <p className="text-sm text-muted">{useBackup ? t2("backupIntro") : t2("totpIntro")}</p>
        <input key={useBackup ? "b" : "t"} name="code" required autoFocus autoComplete="one-time-code" inputMode={useBackup ? "text" : "numeric"} aria-label={t2("totpTitle")} className="input text-center text-xl tracking-[0.3em]" />
        {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>{loading ? tc("loading") : t2("verify")}</button>
        <button type="button" className="w-full text-center text-sm font-semibold text-primary" onClick={() => { setUseBackup(!useBackup); setError(""); }}>{useBackup ? t2("useApp") : t2("useBackup")}</button>
      </form>
    );
  }

  const [agree, setAgree] = useState(false);
  const tab = (on: boolean) => `flex min-h-[42px] items-center justify-center rounded-[9px] text-sm font-bold ${on ? "bg-surface text-text shadow-[0_1px_3px_rgba(15,23,42,0.12)]" : "text-muted"}`;
  const field = "h-[50px] w-full rounded-xl border border-[#CBD2E1] bg-surface px-3.5 text-base dark:border-border";
  return (
    <form method="post" onSubmit={onSubmit} className="mx-auto flex w-full max-w-md flex-col gap-5 px-6 pb-10 pt-7">
      <div className="flex items-center justify-between">
        <Logo />
        <LangSegment />
      </div>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-extrabold leading-tight">{mode === "login" ? tu("welcomeBack") : tu("registerHeading")}</h1>
        <p className="text-sm leading-normal text-muted">{mode === "login" ? tu("loginSub") : tu("registerSub")}</p>
      </div>
      <nav className="grid grid-cols-2 rounded-xl bg-surface-2 p-1" aria-label={t("loginTitle")}>
        <Link href={`/auth/register${nextQs}`} onClick={(e) => switchTo(e, "register")} aria-current={mode === "register" ? "page" : undefined} className={tab(mode === "register")}>{tu("tabRegister")}</Link>
        <Link href={`/auth/login${nextQs}`} onClick={(e) => switchTo(e, "login")} aria-current={mode === "login" ? "page" : undefined} className={tab(mode === "login")}>{tu("tabLogin")}</Link>
      </nav>
      {google && (
        <>
          <button
            type="button"
            disabled={!hydrated || loading}
            onClick={async () => {
              setError("");
              setLoading(true);
              const done = `/${locale}${next && next.startsWith("/") && !next.startsWith("//") ? next.replace(/^\/(ht|fr)(?=\/|$)/, "") || "/account" : "/account"}`;
              const r = await authClient.signIn.social({ provider: "google", callbackURL: done, errorCallbackURL: `/${locale}/auth/login?error=google` });
              if (r?.error) {
                setLoading(false);
                setError(tg("error"));
              }
            }}
            className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] border border-[#CBD2E1] bg-white text-[15px] font-bold text-[#0F172A] disabled:opacity-60"
          >
            <GoogleLogo />
            {tg("continue")}
          </button>
          <div className="flex items-center gap-2.5 text-[13px] text-[#64748B]" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            {tg("or")}
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      <div className="flex flex-col gap-3">
        {mode === "register" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-sm font-semibold">{t("name")}</label>
            <input id="name" name="name" required maxLength={80} autoComplete="name" className={field} />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-semibold">{t("email")}</label>
          <input id="email" name="email" type="email" required autoComplete="email" placeholder={tu("emailPlaceholder")} className={field} />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="text-sm font-semibold">{t("password")}</label>
            {mode === "login" && <Link href="/auth/forgot" className="text-[13px] font-semibold text-[#00209F] dark:text-primary">{tu("forgotShort")}</Link>}
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPw ? "text" : "password"}
              required
              minLength={8}
              maxLength={128}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className={`${field} pr-20`}
              onChange={(e) => setPw(e.target.value)}
            />
            <button type="button" onClick={() => setShowPw(!showPw)} aria-pressed={showPw} className="absolute right-1 top-1/2 min-h-10 -translate-y-1/2 rounded-lg px-3 text-xs font-bold text-muted hover:text-text">
              {showPw ? tu("hide") : tu("show")}
            </button>
          </div>
          {mode === "register" && pw && pw.length < 12 && <p className="text-xs text-muted" aria-live="polite">{scoreLabel}. {t("passwordHint")}</p>}
        </div>
        {mode === "register" && (
          <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-[13px] leading-normal text-text/80">
            <input type="checkbox" checked={agree} onChange={() => setAgree((a) => !a)} required className="m-0 h-[22px] w-[22px] flex-none accent-[#0F172A]" />
            <span>{tu.rich("terms", { link: (c) => <Link href="/terms" className="font-semibold text-[#00209F] underline dark:text-primary">{c}</Link> })}</span>
          </label>
        )}
      </div>
      <Turnstile key={captchaKey} onToken={setCaptcha} locale={locale} />
      {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p>}
      <button
        className="flex h-[54px] w-full items-center justify-center rounded-[14px] bg-text text-base font-bold text-surface disabled:bg-[#CBD5E1] disabled:text-[#475569]"
        disabled={loading || !hydrated || (turnstileOn && !captcha) || (mode === "register" && !agree)}
      >
        {loading ? tc("loading") : mode === "login" ? tu("tabLogin") : tu("tabRegister")}
      </button>
      <p className="text-center text-xs leading-normal text-[#64748B]">{tu("secure")}</p>
    </form>
  );
}

/** Google's official "G" mark (multicolor), as Google's sign-in branding asks. */
function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
