"use client";
import { useEffect, useLayoutEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter as useNextRouter } from "next/navigation";
import { Link, getPathname, usePathname, useRouter } from "@/i18n/navigation";
import { localeNames, locales, type Locale } from "@/i18n/routing";
import { saveLocalePreference } from "@/actions/prefs";
import { authClient } from "@/lib/auth-client";
import { BagIcon, BookIcon, FileIcon, HelpIcon, HomeIcon, ListIcon, LogoutIcon, PlusCircleIcon, MoonIcon, NewsIcon, StoreIcon, SunIcon, TagIcon, UserIcon, WalletIcon } from "./Icons";

/**
 * Keeps light/dark after client-side navigation. Changing language re-renders <html> from the server,
 * which drops the "dark" class the first-paint script had added; this puts it back before the browser paints.
 */
export type ThemeMode = "light" | "dark" | "system";

function savedMode(): ThemeMode | null {
  try {
    const v = localStorage.getItem("hv_theme");
    return v === "light" || v === "dark" || v === "system" ? v : null;
  } catch {
    return null;
  }
}

/** Puts light/dark on the page and matches the phone's status bar color (installed app included). */
function applyTheme(mode: ThemeMode | null, defaultMode: "dark" | "light") {
  const dark = mode === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches : mode ? mode === "dark" : defaultMode === "dark";
  document.documentElement.classList.toggle("dark", dark);
  const color = dark ? "#0A0F1C" : "#FFFFFF";
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute("content", color);
    m.removeAttribute("media");
  });
  return dark;
}

/**
 * Keeps light/dark after client-side navigation. Changing language re-renders <html> from the server,
 * which drops the "dark" class the first-paint script had added; this puts it back before the browser paints.
 */
export function ThemeKeeper({ defaultMode }: { defaultMode: "dark" | "light" }) {
  const locale = useLocale();
  const pathname = usePathname();
  useLayoutEffect(() => {
    const html = document.documentElement;
    applyTheme(savedMode(), defaultMode);
    // After a language switch: same scroll position, no entrance animations replaying, a short fade in.
    if (html.dataset.switching) {
      delete html.dataset.switching;
      html.dataset.switched = "1";
      try {
        const y = Number(sessionStorage.getItem("hv_scroll"));
        sessionStorage.removeItem("hv_scroll");
        if (y > 0) window.scrollTo(0, y);
      } catch {}
      const id = setTimeout(() => delete html.dataset.switched, 700);
      return () => clearTimeout(id);
    }
  }, [locale, pathname, defaultMode]);
  // "Otomatik": follow the phone when it switches between light and dark.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => savedMode() === "system" && applyTheme("system", defaultMode);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [defaultMode]);
  return null;
}

function saveMode(mode: ThemeMode) {
  try {
    localStorage.setItem("hv_theme", mode);
    // Also a cookie, so the server sends the page already in the right theme (no flash on any navigation).
    document.cookie = `hv_theme=${mode}; path=/; max-age=31536000; samesite=lax`;
  } catch {}
}

export function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  const t = useTranslations("common");
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  function toggle() {
    const next: ThemeMode = dark ? "light" : "dark";
    saveMode(next);
    setDark(applyTheme(next, "light"));
  }
  return (
    <button type="button" onClick={toggle} className="btn-ghost min-h-10 px-2.5" aria-label={`${t("theme")}: ${dark ? t("dark") : t("light")}`}>
      {dark ? <SunIcon /> : <MoonIcon />}
      {withLabel && <span>{dark ? t("light") : t("dark")}</span>}
    </button>
  );
}

/** Account screen: Klè / Fonse / Otomatik (follows the phone). */
export function ThemeSegment() {
  const t = useTranslations("common");
  const [mode, setMode] = useState<ThemeMode>("light");
  useEffect(() => setMode(savedMode() ?? (document.documentElement.classList.contains("dark") ? "dark" : "light")), []);
  const pick = (m: ThemeMode) => {
    saveMode(m);
    applyTheme(m, "light");
    setMode(m);
  };
  return (
    <div role="group" aria-label={t("theme")} className="flex overflow-hidden rounded-[10px] border border-[#CBD2E1] dark:border-border">
      {(["light", "dark", "system"] as const).map((m) => (
        <button key={m} type="button" onClick={() => pick(m)} aria-pressed={m === mode}
          className={`h-9 min-w-11 px-2.5 text-[13px] font-bold ${m === mode ? "bg-text text-surface" : "bg-surface text-text/80"}`}>
          {m === "light" ? t("light") : m === "dark" ? t("dark") : t("themeAuto")}
        </button>
      ))}
    </div>
  );
}


/** Switch language and stay on the same page; signed-in customers keep the choice on their account. */
function useChangeLocale() {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const nextRouter = useNextRouter();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Locale>(locale);
  useEffect(() => setPicked(locale), [locale]);

  /**
   * Fetch the other languages of this page ahead of time, so switching is near-instant.
   * Through Next's own router: next-intl's router.prefetch would also save each prefetched language
   * as the visitor's choice (the last one prefetched would win).
   */
  const prefetch = () => {
    for (const l of locales) {
      // @ts-expect-error -- params are compatible with the current pathname
      if (l !== locale) nextRouter.prefetch(getPathname({ href: { pathname, params }, locale: l, forcePrefix: true }));
    }
  };

  const change = (next: Locale) => {
    if (next === locale) return;
    setPicked(next); // the chosen flag lights up at once
    // A thin progress bar and a soft fade while the new language loads (see globals.css: data-switching).
    document.documentElement.dataset.switching = "1";
    setTimeout(() => delete document.documentElement.dataset.switching, 8000); // never stay dimmed if the network fails
    try {
      sessionStorage.setItem("hv_scroll", String(window.scrollY));
    } catch {}
    start(() => {
      saveLocalePreference(next);
      // @ts-expect-error -- params are compatible with the current pathname
      router.replace({ pathname, params }, { locale: next, scroll: false });
    });
  };
  return { locale: picked, change, pending, prefetch };
}

/** Sign-in screen (mockup): KR | FR segmented switch; on the account screen with the full names. */
export function LangSegment({ full = false }: { full?: boolean }) {
  const t = useTranslations("common");
  const { locale, change, pending } = useChangeLocale();
  return (
    <div role="group" aria-label={t("language")} className={`flex overflow-hidden rounded-[10px] border border-[#CBD2E1] dark:border-border ${pending ? "opacity-60" : ""}`}>
      {locales.map((l) => (
        <button key={l} type="button" onClick={() => change(l)} aria-pressed={l === locale}
          className={`h-9 min-w-11 px-2 ${full ? "px-3 text-[13px] font-bold" : "text-xs font-extrabold"} ${l === locale ? "bg-text text-surface" : "bg-surface text-text/80"}`}>
          {full ? localeNames[l] : l === "ht" ? "KR" : "FR"}
        </button>
      ))}
    </div>
  );
}

/** Screens with their own top bar (PageBar): on phones the site header is hidden there, as in the mockup. */
const OWN_BAR = ["/order", "/trial", "/help", "/account", "/auth"];
export function HeaderSlot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const own = OWN_BAR.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return <div className={`sticky top-0 z-40 ${own ? "max-md:hidden" : ""}`}>{children}</div>;
}

/** On phones the app screens (home and screens with their own top bar) have no footer or floating help button, as in the mockup. */
export function PhoneHidden({ onHome = true, children }: { onHome?: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const hide = (onHome && pathname === "/") || OWN_BAR.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return <div className={hide ? "max-md:hidden" : undefined}>{children}</div>;
}

/** Header (mockup): "KR" / "FR"; tapping switches to the other language. */
export function LangToggle() {
  const t = useTranslations("common");
  const { locale, change, pending, prefetch } = useChangeLocale();
  const next = locales.find((l) => l !== locale) ?? locale;
  return (
    <button
      type="button"
      onClick={() => change(next)}
      onPointerEnter={prefetch}
      aria-label={`${t("otherLanguage")}: ${localeNames[next]}`}
      className={`grid h-11 min-w-11 place-items-center rounded-[10px] text-xs font-extrabold text-text/80 hover:bg-surface-2 ${pending ? "opacity-60" : ""}`}
    >
      {locale === "ht" ? "KR" : "FR"}
    </button>
  );
}





export function SignOutButton({ className = "btn-secondary" }: { className?: string }) {
  const t = useTranslations("common");
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      <LogoutIcon width={18} height={18} aria-hidden />
      {t("signOut")}
    </button>
  );
}


/** Icon for a menu link, chosen from its address (custom menu links get a page icon). */
function navIcon(href: string) {
  if (href === "/" || href === "") return HomeIcon;
  if (href.startsWith("/store")) return StoreIcon;
  if (href.startsWith("/categor")) return TagIcon;
  if (href.startsWith("/guide")) return BookIcon;
  if (href.startsWith("/news")) return NewsIcon;
  if (href.startsWith("/faq") || href.startsWith("/help") || href.startsWith("/support")) return HelpIcon;
  if (href.startsWith("/account/wallet")) return WalletIcon;
  if (href.startsWith("/account/orders")) return BagIcon;
  if (href.startsWith("/account")) return UserIcon;
  return FileIcon;
}

function MenuLink({ href, label }: { href: string; label: string }) {
  const Icon = navIcon(href);
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-2xl px-2 py-2 font-semibold hover:bg-surface-2">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary transition-transform group-hover:scale-105">
        <Icon width={20} height={20} />
      </span>
      <span className="flex-1">{label}</span>
      <span className="text-muted transition-transform group-hover:translate-x-0.5" aria-hidden>›</span>
    </Link>
  );
}


/**
 * On phones, iOS Safari keeps fixed bars where they were when the keyboard opens, so they float
 * in the middle of the screen. While the keyboard is up (a field is focused and the visible area shrank),
 * <html data-kb> is set and anything with the class "kb-hide" (bottom bar, WhatsApp button) steps aside.
 */
function useKeyboardFlag() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !window.matchMedia("(pointer: coarse)").matches) return;
    const root = document.documentElement;
    const typing = (el: Element | null) =>
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      (el instanceof HTMLElement && el.isContentEditable) ||
      (el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "reset", "file", "range", "color", "image", "hidden"].includes(el.type));
    // Tallest visible area seen so far = no keyboard. Reset on rotation.
    let full = vv.height;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      full = Math.max(full, vv.height);
      // Hidden only while a field is focused AND the visible area really shrank (keyboard up). Anything else: shown.
      if (typing(document.activeElement) && vv.height < full * 0.8) root.dataset.kb = "";
      else delete root.dataset.kb;
    };
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(check, 100);
    };
    const rotate = () => {
      full = 0;
      later();
    };
    vv.addEventListener("resize", later);
    document.addEventListener("focusin", later);
    document.addEventListener("focusout", later);
    window.addEventListener("orientationchange", rotate);
    return () => {
      clearTimeout(timer);
      vv.removeEventListener("resize", later);
      document.removeEventListener("focusin", later);
      document.removeEventListener("focusout", later);
      window.removeEventListener("orientationchange", rotate);
      delete root.dataset.kb;
    };
  }, []);
}

/** Phone-only bottom navigation: home, new order, orders, wallet, account (as in the mockup). */
export function BottomNav({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("common");
  const pathname = usePathname();
  useKeyboardFlag();
  const gate = (href: string) => (signedIn ? href : `/auth/login?next=${href}`);
  const items = [
    { href: "/", label: t("home"), icon: HomeIcon, active: pathname === "/" },
    { href: "/order", label: t("tabOrder"), icon: PlusCircleIcon, active: pathname.startsWith("/order") },
    { href: gate("/account/orders"), label: t("tabOrders"), icon: ListIcon, active: pathname.startsWith("/account/orders") },
    { href: gate("/account/wallet"), label: t("wallet"), icon: WalletIcon, active: pathname.startsWith("/account/wallet") },
    { href: signedIn ? "/account" : "/auth/login", label: t("tabAccount"), icon: UserIcon, active: (pathname.startsWith("/account") && !pathname.startsWith("/account/wallet") && !pathname.startsWith("/account/orders")) || pathname.startsWith("/auth") },
  ];
  return (
    <nav
      aria-label={t("menu")}
      className="kb-hide fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface md:hidden"
      style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom, 0px))", paddingLeft: "env(safe-area-inset-left, 0px)", paddingRight: "env(safe-area-inset-right, 0px)" }}
    >
      <ul className="mx-auto grid max-w-md grid-cols-5 px-1 pt-1.5">
        {items.map(({ href, label, icon: Icon, active }) => (
          <li key={label} className="min-w-0">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-[3px] py-2 text-[11px] transition-colors ${active ? "font-bold text-text" : "font-semibold text-muted hover:text-text"}`}
            >
              <Icon width={22} height={22} strokeWidth={2} />
              <span className="max-w-full truncate px-1">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
