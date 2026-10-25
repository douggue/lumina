import { requireStaff } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { normalizeHomepage } from "@/lib/homepage";
import { HomepageEditor } from "@/components/admin/HomepageEditor";
import { PageTitle } from "@/components/admin/ui";

export const metadata = { title: "Homepage" };

export default async function HomepageAdmin() {
  await requireStaff("content.manage");
  const s = await getSettings();
  const draft = normalizeHomepage(s.homepageDraft ?? s.homepage);
  const published = JSON.stringify(normalizeHomepage(s.homepage));
  return (
    <>
      <PageTitle title="Homepage" sub="Reorder, hide and reword homepage sections. Save a draft, preview it, then publish. Images are in Settings → Brand images." />
      <HomepageEditor initial={draft} unpublishedChanges={JSON.stringify(draft) !== published} history={(s.homepageHistory ?? []).map((h) => ({ at: h.at, by: h.by }))} />
    </>
  );
}
