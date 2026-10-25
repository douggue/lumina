/** Localized JSON text stored as { ht, fr }. Falls back to Kreyòl, then French, then any value. */
export type LocalizedText = Partial<Record<"ht" | "fr", string>>;

export function t(value: unknown, locale: string): string {
  if (!value || typeof value !== "object") return typeof value === "string" ? value : "";
  const v = value as LocalizedText;
  return (v as Record<string, string | undefined>)[locale] || v.ht || v.fr || Object.values(v).find(Boolean) || "";
}

const DATE_LOCALES: Record<string, string> = { ht: "fr-HT", fr: "fr-FR", en: "en-US" };

/** Locale-aware date that never throws, whatever locale string reaches it. */
export function formatDate(d: Date, locale: string, style: "medium" | "long" = "medium"): string {
  try {
    return d.toLocaleDateString(DATE_LOCALES[locale] ?? "en-US", { dateStyle: style });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
