export const HOME_SECTIONS = ["categories", "featured", "howItWorks", "wallet", "news", "reviews", "trust", "faq"] as const;
export type HomeSectionId = (typeof HOME_SECTIONS)[number];

export const HOME_SECTION_LABELS: Record<HomeSectionId, string> = {
  categories: "Shop by category",
  featured: "Popular products",
  howItWorks: "How it works (3 steps)",
  wallet: "Wallet promotion",
  news: "Latest news (3 newest articles)",
  reviews: "Customer reviews (Admin → Trust; hidden until one is approved)",
  trust: "Why players choose us",
  faq: "Frequently asked questions",
};

export type HomepageConfig = {
  sections: { id: HomeSectionId; visible: boolean }[];
  /** Optional per-language overrides of the hero text; empty = default wording */
  hero: { eyebrow: Record<string, string>; title: Record<string, string>; subtitle: Record<string, string> };
  ctaHref: string;
};

export const DEFAULT_HOMEPAGE: HomepageConfig = {
  sections: HOME_SECTIONS.map((id) => ({ id, visible: true })),
  hero: { eyebrow: {}, title: {}, subtitle: {} },
  ctaHref: "/order",
};

/** Accepts stored JSON of any age and returns a complete, valid config (unknown sections dropped, new ones placed after their usual neighbour). */
export function normalizeHomepage(raw: unknown): HomepageConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<HomepageConfig>;
  const seen = new Set<string>();
  const sections = (Array.isArray(r.sections) ? r.sections : [])
    .filter((x) => x && HOME_SECTIONS.includes(x.id as HomeSectionId) && !seen.has(x.id) && seen.add(x.id))
    .map((x) => ({ id: x.id as HomeSectionId, visible: x.visible !== false }));
  HOME_SECTIONS.forEach((id, i) => {
    if (seen.has(id)) return;
    const after = i > 0 ? sections.findIndex((x) => x.id === HOME_SECTIONS[i - 1]) : -1;
    sections.splice(after >= 0 ? after + 1 : sections.length, 0, { id, visible: true });
    seen.add(id);
  });
  return {
    sections,
    hero: { eyebrow: r.hero?.eyebrow ?? {}, title: r.hero?.title ?? {}, subtitle: r.hero?.subtitle ?? {} },
    ctaHref: typeof r.ctaHref === "string" && r.ctaHref.startsWith("/") ? r.ctaHref : "/order",
  };
}
