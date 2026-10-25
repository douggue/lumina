import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { getDisplaySettings } from "@/lib/settings";
import { themeCss, themeScript, cssGuardScript } from "@/lib/theme-css";
import "../globals.css";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · HaitiViral Admin" }, robots: { index: false, follow: false } };

const sans = Plus_Jakarta_Sans({ subsets: ["latin", "latin-ext"], variable: "--font-body", display: "swap" });
const display = Plus_Jakarta_Sans({ subsets: ["latin", "latin-ext"], weight: ["700", "800"], variable: "--font-display-face", display: "swap" });

/** The back office uses the store's colors but starts light; staff can switch to dark (remembered separately from the store). */
export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getDisplaySettings();
  const css = themeCss(settings.theme);
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${display.variable}`} data-motion="calm">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript("light", "hv_admin_theme") }} />
        <script dangerouslySetInnerHTML={{ __html: cssGuardScript }} />
        {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
