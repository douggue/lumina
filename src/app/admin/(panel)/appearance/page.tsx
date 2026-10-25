import { requireStaff } from "@/lib/session";
import { DEFAULT_THEME, fullTheme, getSettings } from "@/lib/settings";
import { ThemeEditor } from "@/components/admin/ThemeEditor";
import { PageTitle } from "@/components/admin/ui";

export const metadata = { title: "Appearance" };

export default async function AppearancePage() {
  await requireStaff("content.manage");
  const s = await getSettings();
  return (
    <>
      <PageTitle title="Appearance" sub="Light or dark by default, colors, motion style, glow, fonts and the scrolling band. Colors that would make text unreadable are refused, and every published theme can be rolled back." />
      <ThemeEditor initial={fullTheme(s.theme)} defaults={DEFAULT_THEME} history={(s.themeHistory ?? []).map((h) => ({ at: h.at, by: h.by, theme: fullTheme(h.theme) }))} />
    </>
  );
}
