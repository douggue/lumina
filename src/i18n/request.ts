import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { unstable_cache } from "next/cache";
import { routing } from "./routing";
import { prisma } from "@/lib/db";

/** Admin wording overrides (Admin → Translations), cached until an edit revalidates the "translations" tag. */
const getOverrides = unstable_cache(
  async (locale: string) => {
    try {
      return await prisma.translationOverride.findMany({ where: { locale }, select: { key: true, value: true } });
    } catch {
      return [];
    }
  },
  ["translation-overrides"],
  { tags: ["translations"], revalidate: 3600 },
);

function applyOverrides(messages: Record<string, unknown>, rows: { key: string; value: string }[]) {
  for (const { key, value } of rows) {
    const parts = key.split(".");
    let node = messages as Record<string, unknown>;
    for (const p of parts.slice(0, -1)) {
      if (typeof node[p] !== "object" || node[p] === null) node = {} as Record<string, unknown>;
      else node = node[p] as Record<string, unknown>;
    }
    const last = parts.at(-1)!;
    if (typeof node[last] === "string") node[last] = value;
  }
  return messages;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  // Missing keys fall back to Kreyòl.
  const [own, ht] = await Promise.all([
    import(`../messages/${locale}.json`).then((m) => m.default),
    import(`../messages/ht.json`).then((m) => m.default),
  ]);
  const messages = deepMerge(ht, own);
  return { locale, messages: applyOverrides(structuredClone(messages), await getOverrides(locale)) };
});

function deepMerge(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && typeof base[k] === "object"
      ? deepMerge(base[k] as Record<string, unknown>, v as Record<string, unknown>)
      : v;
  }
  return out;
}
