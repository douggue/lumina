import ht from "@/messages/ht.json";
import fr from "@/messages/fr.json";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { TranslationEditor } from "@/components/admin/TranslationEditor";
import { PageTitle } from "@/components/admin/ui";

export const metadata = { title: "Translations" };

function flatten(obj: unknown, prefix = "", out: Record<string, string> = {}) {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else if (typeof obj === "string") out[prefix] = obj;
  return out;
}

export default async function TranslationsPage() {
  await requireStaff("content.manage");
  const base = { ht: flatten(ht), fr: flatten(fr) };
  const overrides = await prisma.translationOverride.findMany();
  const keys = Object.keys(base.ht).sort();
  const coverage = (["fr"] as const).map((l) => ({ l, missing: keys.filter((k) => !base[l][k]).length }));
  return (
    <>
      <PageTitle title="Translations" sub={`Change any interface wording without a developer. ${keys.length} texts. Clearing a box restores the standard wording.`} />
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {coverage.map((c) => (
          <span key={c.l} className={`badge px-3 py-1.5 ${c.missing ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}>{c.l.toUpperCase()}: {c.missing ? `${c.missing} missing (shows Kreyòl)` : "complete"}</span>
        ))}
        <span className="badge bg-surface-2 px-3 py-1.5">{overrides.length} custom edits</span>
      </div>
      <TranslationEditor keys={keys} base={base} overrides={overrides.map((o) => ({ locale: o.locale, key: o.key, value: o.value }))} />
    </>
  );
}
