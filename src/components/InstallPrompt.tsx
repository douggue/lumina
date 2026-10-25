"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { CloseIcon, PlusSquareIcon, ShareIcon } from "./Icons";
import { INSTALL_EVENT, isInAppBrowser, isIos, isStandalone } from "@/lib/pwa-client";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const OFF_KEY = "hv_install_off";
const VISITS_KEY = "hv_install_visits";
const SNOOZE_MS = 14 * 86_400_000;

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {}
}

/**
 * "Install the app" card. Android/Chrome: the browser's install dialog. iPhone Safari: the 3 steps (Share → Add to Home Screen).
 * Shows by itself from the 2nd page view (~6 s in), not on checkout/sign-in, never inside the installed app,
 * and stays away 14 days after "Later". The footer link opens it any time.
 */
export function InstallPrompt() {
  const t = useTranslations("pwa");
  const pathname = usePathname();
  const [mode, setMode] = useState<"android" | "ios" | null>(null);
  const [open, setOpen] = useState(false);
  const deferred = useRef<BIPEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return;
    if (isIos() && !isInAppBrowser()) setMode("ios");
    const onBip = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BIPEvent;
      setMode("android");
    };
    const onInstalled = () => {
      setOpen(false);
      setMode(null);
      write(OFF_KEY, String(Date.now() + 10 * 365 * 86_400_000));
    };
    const onAsk = () => setOpen(true);
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener(INSTALL_EVENT, onAsk);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener(INSTALL_EVENT, onAsk);
    };
  }, []);

  // Let the footer link know whether to show itself.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-can-install", !!mode);
  }, [mode]);

  useEffect(() => {
    if (!mode || open) return;
    if (/\/(checkout|auth|cart)/.test(pathname)) return;
    if (Number(read(OFF_KEY) ?? 0) > Date.now()) return;
    const visits = Number(read(VISITS_KEY) ?? 0) + 1;
    write(VISITS_KEY, String(visits));
    if (visits < 2) return;
    const timer = setTimeout(() => setOpen(true), 6000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pathname]);

  if (!open || !mode) return null;

  const later = () => {
    write(OFF_KEY, String(Date.now() + SNOOZE_MS));
    setOpen(false);
  };
  const install = async () => {
    const e = deferred.current;
    if (!e) return;
    deferred.current = null;
    await e.prompt();
    const { outcome } = await e.userChoice;
    setOpen(false);
    if (outcome === "accepted") setMode(null);
    else later();
  };

  return (
    <div
      role="dialog"
      aria-label={t("title")}
      className="install-pop kb-hide fixed inset-x-3 z-50 mx-auto max-w-sm rounded-2xl border border-border bg-surface p-4 shadow-[0_18px_50px_-12px_rgba(0,0,0,.7)] md:inset-x-auto md:right-6 md:bottom-6"
      style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{mode === "ios" ? t("iosTitle") : t("title")}</p>
          <p className="mt-1 text-sm text-muted">{t("body")}</p>
        </div>
        <button type="button" onClick={later} aria-label={t("notNow")} className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text">
          <CloseIcon width={14} height={14} />
        </button>
      </div>
      {mode === "ios" ? (
        <ol className="mt-3 space-y-2 text-sm">
          <li className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-primary"><ShareIcon width={16} height={16} /></span>
            <span>1. {t("iosStep1")}</span>
          </li>
          <li className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-primary"><PlusSquareIcon width={16} height={16} /></span>
            <span>2. {t("iosStep2")}</span>
          </li>
          <li className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs font-bold text-primary">OK</span>
            <span>3. {t("iosStep3")}</span>
          </li>
        </ol>
      ) : (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={install} className="btn-primary min-h-11 flex-1">{t("install")}</button>
          <button type="button" onClick={later} className="btn-secondary min-h-11">{t("notNow")}</button>
        </div>
      )}
    </div>
  );
}

/** Footer link: opens the install card (hidden when the app is installed or the browser can't install). */
export function InstallLink() {
  const t = useTranslations("pwa");
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(INSTALL_EVENT))} className="install-link items-center gap-2 text-sm font-semibold text-primary hover:underline">
      📲 {t("installLink")}
    </button>
  );
}
