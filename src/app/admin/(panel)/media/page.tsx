import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { scanMedia } from "@/actions/ops";
import { ActionButton } from "@/components/admin/ActionButton";
import { PageTitle } from "@/components/admin/ui";
import { MediaGrid } from "@/components/admin/MediaGrid";
import { ImageField } from "@/components/admin/ImageField";

export const metadata = { title: "Media" };

const FOLDERS = ["products", "categories", "brand"] as const;

export default async function Media({ searchParams }: { searchParams: Promise<{ folder?: string }> }) {
  await requireStaff("catalog.manage");
  const { folder } = await searchParams;
  const f = FOLDERS.find((x) => x === folder);
  const assets = await prisma.mediaAsset.findMany({ where: f ? { folder: f } : {}, orderBy: { createdAt: "desc" }, take: 300 });
  return (
    <>
      <PageTitle
        title="Media library"
        sub="Every uploaded image. Add alt text for accessibility and SEO. Images still used on the site cannot be deleted."
        actions={<ActionButton label="Find existing images" action={scanMedia} />}
      />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <a href="/admin/media" className={`badge ${!f ? "bg-primary text-white" : "bg-surface-2"}`}>All</a>
        {FOLDERS.map((x) => <a key={x} href={`/admin/media?folder=${x}`} className={`badge ${f === x ? "bg-primary text-white" : "bg-surface-2"}`}>{x}</a>)}
      </div>
      <div className="card mb-6 max-w-xl p-4">
        <ImageField name="newUpload" label="Upload a new image" folder={f ?? "products"} hint="It appears below and can then be picked from any image field." refreshOnUpload />
      </div>
      <MediaGrid items={assets.map((a) => ({ id: a.id, url: a.url, folder: a.folder, alt: a.alt, createdAt: a.createdAt.toISOString() }))} />
    </>
  );
}
