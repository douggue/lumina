import { requireStaff } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { NavigationEditor } from "@/components/admin/NavigationEditor";
import { PageTitle } from "@/components/admin/ui";

export const metadata = { title: "Navigation" };

export default async function NavigationPage() {
  await requireStaff("content.manage");
  const s = await getSettings();
  return (
    <>
      <PageTitle title="Navigation" sub="Header menu and extra footer links. Leave the header list empty to keep the standard menu (Store, Categories, Guides, News, FAQ). Custom pages with “Link in footer” are added automatically." />
      <NavigationEditor initial={s.navigation ?? { header: [], footer: [] }} />
    </>
  );
}
