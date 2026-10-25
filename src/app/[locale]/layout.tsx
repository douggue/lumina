import { siteUrl } from "@/lib/site-url";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { getDisplaySettings } from "@/lib/settings";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { BottomNav, HeaderSlot, PhoneHidden, ThemeKeeper } from "@/components/HeaderClient";
import { AnnouncementBar } from "@/components/AnnouncementBar";
import { alternates } from "@/lib/seo";
import { themeAttrs, themeCss, themeScript, cssGuardScript } from "@/lib/theme-css";
import { fullTheme } from "@/lib/settings";
import { cookies, headers } from "next/headers";
import { getUser } from "@/lib/session";
import { ServiceWorker } from "@/components/ServiceWorker";
import { InstallPrompt } from "@/components/InstallPrompt";
import { SPLASH } from "@/lib/splash";
import "../globals.css";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0F1C" },
  ],
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const [t, settings] = await Promise.all([getTranslations({ locale, namespace: "meta" }), getDisplaySettings()]);
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: t("title"), template: "%s · HaitiViral" },
    description: t("description"),
    alternates: alternates(locale, ""),
    openGraph: { siteName: settings.businessName, locale, type: "website", ...(settings.ogImageUrl ? { images: [{ url: settings.ogImageUrl, width: 1200, height: 630 }] } : {}) },
    manifest: "/manifest.webmanifest",
    // Installed on iPhone: full screen, no Safari bar, logo launch screen.
    appleWebApp: { capable: true, title: "HaitiViral", statusBarStyle: "default", startupImage: SPLASH },
    icons: { icon: [{ url: "/favicon-48.png", sizes: "48x48", type: "image/png" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-touch-icon.png" },
  };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [settings, t, user, hdrs, jar] = await Promise.all([getDisplaySettings(), getTranslations("common"), getUser(), headers(), cookies()]);
  // Data saver: the visitor's toggle, or the browser's Save-Data signal.
  const dataSaver = jar.get("hv_ds")?.value === "1" || (jar.get("hv_ds")?.value !== "0" && hdrs.get("save-data") === "on");
  // Light/dark: the visitor's saved choice (cookie), else the store default. Rendered by the server, so it never flashes.
  const themeCookie = jar.get("hv_theme")?.value;
  const dark = themeCookie ? themeCookie === "dark" : fullTheme(settings.theme).defaultMode === "dark";

  return (
    <html lang={locale} suppressHydrationWarning className={`${dataSaver ? "data-saver" : ""}${dark ? " dark" : ""}`.trim()} {...themeAttrs(settings.theme)}>
      <head>
        {/* Applies light/dark before paint to avoid a flash */}
        <script dangerouslySetInnerHTML={{ __html: themeScript(fullTheme(settings.theme).defaultMode) }} />
        <script dangerouslySetInnerHTML={{ __html: cssGuardScript }} />
        {themeCss(settings.theme) && <style dangerouslySetInnerHTML={{ __html: themeCss(settings.theme) }} />}
      </head>
      <body className="min-h-dvh antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider>
            <AnnouncementBar settings={settings} locale={locale} />
            <HeaderSlot>
              <Header />
            </HeaderSlot>
            <main id="main">{children}</main>
            <PhoneHidden>
              <Footer settings={settings} />
            </PhoneHidden>
            <PhoneHidden onHome={false}>
              <WhatsAppButton number={settings.whatsappNumber} />
            </PhoneHidden>
            {/* Room for the phone bottom navigation so it never covers the footer */}
            <div className="md:hidden" style={{ height: "calc(4rem + env(safe-area-inset-bottom, 0px))" }} aria-hidden />
            <BottomNav signedIn={!!user} />
            <ThemeKeeper defaultMode={fullTheme(settings.theme).defaultMode} />
            <ServiceWorker />
            <InstallPrompt />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
