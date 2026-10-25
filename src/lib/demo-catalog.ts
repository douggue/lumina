/**
 * Demo catalog: one category per platform, one product per platform + service kind, and three choices per product
 * (Bon mache / Pi bon kalite / Rapid) priced per 1,000. Plus two starter packs. Pictures: public/demo
 * (tools/make-demo-images.mjs). Names, prices and times are examples, not provider inventory.
 * Safe to run twice (existing slugs are skipped). Used by `npm run db:seed` and by /admin/setup.
 */
import type { PrismaClient } from "@prisma/client";
import type { Kind, Risk, ServiceMeta, ServiceType } from "./services";
import { infoFromProvider } from "./service-info";

const L = (ht: string, fr: string) => ({ ht, fr });
const htg = (n: number) => Math.round(n * 100);

const categories = [
  { slug: "tiktok", icon: "🎵", name: L("TikTok", "TikTok"), sortOrder: 1 },
  { slug: "instagram", icon: "📸", name: L("Instagram", "Instagram"), sortOrder: 2 },
  { slug: "youtube", icon: "▶️", name: L("YouTube", "YouTube"), sortOrder: 3 },
  { slug: "facebook", icon: "👍", name: L("Facebook", "Facebook"), sortOrder: 4 },
  { slug: "pake", icon: "🎁", name: L("Pake pou kòmanse", "Packs de départ"), sortOrder: 9 },
];

export const KIND_NAMES: Record<Kind, ReturnType<typeof L>> = {
  followers: L("Abòne", "Abonnés"),
  likes: L("Like", "Likes"),
  views: L("Vi", "Vues"),
  comments: L("Kòmantè", "Commentaires"),
  live: L("Live", "Live"),
  account: L("Kont", "Compte"),
  sms: L("SMS", "SMS"),
};

type Tier = [name: ReturnType<typeof L>, type: ServiceType, ratePer1000: number, avg: ReturnType<typeof L>, risk: Risk, refillDays: number, min: number, max: number, drip: boolean, desc: string];
export const CHEAP = L("Bon mache", "Économique");
export const BEST = L("Pi bon kalite", "Meilleure qualité");
export const FAST = L("Rapid", "Rapide");
const MIN = (n: number) => L(`${n} minit`, `${n} minutes`);
const HR = (n: number) => L(`${n} èdtan`, `${n} heure${n > 1 ? "s" : ""}`);
const DAY = (n: number) => L(`${n} jou`, `${n} jour${n > 1 ? "s" : ""}`);
const COMMENTS = L("Kòmantè pèsonèl", "Commentaires personnalisés");
const COMMENTS_HQ = L("Kòmantè pèsonèl HQ", "Commentaires personnalisés HQ");
const COMMENT_LIKES = L("Like sou yon kòmantè", "Likes sur un commentaire");
const VIEWERS = L("Moun k ap gade", "Spectateurs");
const VIEWERS_HQ = L("Moun k ap gade HQ", "Spectateurs HQ");
const LIVE_COMMENTS = L("Kòmantè live", "Commentaires live");

const SERVICES: { platform: string; kind: Kind; featured?: boolean; tiers: Tier[] }[] = [
  { platform: "tiktok", kind: "followers", featured: true, tiers: [
    [CHEAP, "default", 260, HR(6), "high", 0, 100, 20000, true, "No Refill / 5-10K/Day"],
    [BEST, "default", 420, HR(2), "low", 30, 100, 50000, true, "Real / 30 Day Refill / 1-3K/Day"],
    [FAST, "default", 520, MIN(30), "med", 30, 100, 50000, false, "30 Day Refill / 20K/Day"],
  ] },
  { platform: "tiktok", kind: "likes", featured: true, tiers: [
    [CHEAP, "default", 40, MIN(20), "med", 0, 50, 100000, true, "No Refill / Instant"],
    [BEST, "default", 95, HR(1), "low", 30, 50, 50000, true, "Real / 30 Day Refill"],
    [FAST, "default", 75, MIN(10), "med", 0, 50, 100000, false, "Instant / 50K/Day"],
  ] },
  { platform: "tiktok", kind: "views", tiers: [
    [CHEAP, "default", 8, MIN(15), "low", 0, 500, 1000000, true, "Instant"],
    [BEST, "default", 20, MIN(30), "low", 30, 500, 1000000, true, "30 Day Refill"],
    [FAST, "default", 15, MIN(5), "low", 0, 500, 1000000, false, "500K/Day"],
  ] },
  { platform: "tiktok", kind: "comments", tiers: [
    [COMMENTS, "comments", 1500, HR(1), "low", 0, 5, 500, false, "Custom Comments / 250-1K/Day"],
    [COMMENTS_HQ, "comments", 2600, HR(3), "low", 0, 5, 300, false, "Real User / Custom Comment"],
    [COMMENT_LIKES, "commentLikes", 300, HR(1), "high", 0, 50, 10000, false, "Comment Likes (check provider)"],
  ] },
  { platform: "tiktok", kind: "live", tiers: [
    [VIEWERS, "live", 900, MIN(3), "med", 0, 50, 5000, false, "Live Stream Views / 30 Minutes"],
    [VIEWERS_HQ, "live", 1400, MIN(3), "low", 0, 50, 3000, false, "Live Stream Views / Real / 30 Minutes"],
    [LIVE_COMMENTS, "liveComments", 2000, MIN(3), "med", 0, 5, 300, false, "Live Comments (check provider)"],
  ] },
  { platform: "instagram", kind: "followers", featured: true, tiers: [
    [CHEAP, "default", 300, HR(8), "high", 0, 100, 20000, true, "No Refill / 500-2K/Day"],
    [BEST, "default", 560, HR(4), "low", 30, 100, 20000, true, "Real / 30 Day Refill"],
    [FAST, "default", 480, HR(1), "med", 30, 100, 50000, false, "30 Day Refill / 10-50K/Day"],
  ] },
  { platform: "instagram", kind: "likes", featured: true, tiers: [
    [CHEAP, "default", 45, MIN(20), "med", 0, 50, 50000, true, "No Refill"],
    [BEST, "default", 110, HR(1), "low", 30, 50, 20000, true, "Real Likes + Reach / 30 Day Refill"],
    [FAST, "default", 90, MIN(10), "med", 0, 50, 50000, false, "Instant"],
  ] },
  { platform: "instagram", kind: "views", tiers: [
    [CHEAP, "default", 10, MIN(15), "low", 0, 500, 1000000, true, "Reels Views"],
    [BEST, "default", 25, MIN(30), "low", 30, 500, 1000000, true, "Reels Views / Refill"],
    [FAST, "default", 20, MIN(5), "low", 0, 500, 1000000, false, "Instant"],
  ] },
  { platform: "instagram", kind: "comments", tiers: [
    [COMMENTS, "comments", 1800, HR(2), "low", 0, 5, 500, false, "Custom Comments"],
    [COMMENTS_HQ, "comments", 3000, HR(4), "low", 0, 5, 300, false, "Real User Custom Comments"],
    [COMMENT_LIKES, "commentLikes", 260, HR(1), "med", 0, 50, 2000, false, "Instagram Comment Likes"],
  ] },
  { platform: "youtube", kind: "followers", tiers: [
    [CHEAP, "default", 1600, DAY(2), "high", 0, 100, 5000, false, "No Refill"],
    [BEST, "default", 2400, DAY(3), "med", 30, 100, 10000, false, "30 Day Refill / 200/Day"],
    [FAST, "default", 2900, DAY(1), "med", 30, 100, 10000, false, "Refill / 1K/Day"],
  ] },
  { platform: "youtube", kind: "likes", tiers: [
    [CHEAP, "default", 120, HR(2), "med", 0, 50, 20000, true, "No Refill"],
    [BEST, "default", 180, HR(4), "low", 30, 50, 20000, true, "30 Day Refill"],
    [FAST, "default", 210, HR(1), "med", 30, 50, 20000, false, "5K/Day"],
  ] },
  { platform: "youtube", kind: "views", featured: true, tiers: [
    [CHEAP, "default", 190, DAY(1), "low", 0, 500, 100000, true, "Views"],
    [BEST, "default", 260, HR(6), "low", 30, 500, 100000, true, "Retention / 30 Day Refill"],
    [FAST, "default", 320, HR(2), "low", 30, 500, 100000, false, "10K/Day"],
  ] },
  { platform: "youtube", kind: "live", tiers: [
    [VIEWERS, "live", 800, MIN(5), "med", 0, 50, 10000, false, "Live Stream Views / 60 Minutes"],
    [VIEWERS_HQ, "live", 1300, MIN(5), "low", 0, 50, 5000, false, "Live Stream Views / Real"],
    [LIVE_COMMENTS, "liveComments", 1900, MIN(5), "med", 0, 5, 300, false, "YouTube Live Stream Custom Comment"],
  ] },
  { platform: "facebook", kind: "followers", tiers: [
    [CHEAP, "default", 260, HR(6), "med", 0, 100, 20000, true, "No Refill"],
    [BEST, "default", 420, DAY(1), "low", 30, 100, 20000, true, "30 Day Refill"],
    [FAST, "default", 380, HR(2), "med", 30, 100, 20000, false, "2K/Day"],
  ] },
  { platform: "facebook", kind: "likes", tiers: [
    [CHEAP, "default", 60, HR(1), "med", 0, 50, 50000, true, "Post Likes"],
    [BEST, "default", 140, HR(3), "low", 30, 50, 20000, true, "Real / Refill"],
    [FAST, "default", 110, MIN(30), "med", 0, 50, 50000, false, "Instant"],
  ] },
  { platform: "facebook", kind: "views", tiers: [
    [CHEAP, "default", 25, MIN(30), "low", 0, 500, 500000, true, "Video Views"],
    [BEST, "default", 45, HR(1), "low", 30, 500, 500000, true, "Refill"],
    [FAST, "default", 35, MIN(10), "low", 0, 500, 500000, false, "Instant"],
  ] },
  { platform: "facebook", kind: "live", tiers: [
    [VIEWERS, "live", 700, MIN(3), "med", 0, 50, 20000, false, "Facebook Live Stream Views / 15-60 Minutes"],
    [VIEWERS_HQ, "live", 1100, MIN(3), "low", 0, 50, 10000, false, "Live Stream Views / Real"],
    [LIVE_COMMENTS, "liveComments", 1700, MIN(3), "med", 0, 5, 300, false, "Live Comments (check provider)"],
  ] },
];

const PICTURES: Record<string, string> = {
  "tiktok-followers": "tiktok-followers", "tiktok-likes": "tiktok-likes", "tiktok-views": "tiktok-views",
  "instagram-followers": "instagram-followers", "instagram-likes": "instagram-likes", "instagram-views": "instagram-views",
  "youtube-views": "youtube-views", "youtube-followers": "youtube-subscribers",
  "facebook-followers": "facebook-page-likes", "facebook-views": "facebook-video-views",
};

export const linkField = (post: boolean) => ({
  key: "link",
  label: post ? L("Lyen videyo a oswa piblikasyon an", "Lien de la vidéo ou de la publication") : L("Lyen pwofil ou", "Lien de votre profil"),
  type: "text",
  required: true,
});

// Contents use each service's first choice (Bon mache); staff change them in Admin → Pricing & profit.
const PACKS: { slug: string; name: Record<string, string>; items: Record<string, string>; price: number; old: number; accent: string; contents: [string, number][] }[] = [
  { slug: "tiktok-starter", name: L("TikTok Starter", "TikTok Starter"), items: L("500 abòne\n1,000 like\n5,000 vi", "500 abonnés\n1 000 likes\n5 000 vues"), price: 405, old: 450, accent: "#111111", contents: [["tiktok-followers", 500], ["tiktok-likes", 1000], ["tiktok-views", 5000]] },
  { slug: "insta-starter", name: L("Insta Starter", "Insta Starter"), items: L("500 abòne\n1,000 like\n2,000 vi reels", "500 abonnés\n1 000 likes\n2 000 vues reels"), price: 360, old: 400, accent: "#C13584", contents: [["instagram-followers", 500], ["instagram-likes", 1000], ["instagram-views", 2000]] },
];

export async function seedDemoCatalog(prisma: PrismaClient): Promise<{ categories: number; products: number }> {
  for (const c of categories) {
    await prisma.category.upsert({ where: { slug: c.slug }, create: c, update: { name: c.name, icon: c.icon, sortOrder: c.sortOrder } });
  }
  const cats = Object.fromEntries((await prisma.category.findMany()).map((c) => [c.slug, c.id]));

  let order = 0;
  for (const s of SERVICES) {
    const slug = `${s.platform}-${s.kind}`;
    if (await prisma.product.findUnique({ where: { slug } })) continue;
    const platform = categories.find((c) => c.slug === s.platform)!.name.ht;
    const kind = KIND_NAMES[s.kind];
    const post = s.kind === "likes" || s.kind === "views" || s.kind === "comments";
    await prisma.product.create({
      data: {
        slug,
        categoryId: cats[s.platform],
        name: L(`${platform} ${kind.ht}`, `${kind.fr} ${platform}`),
        description: L("", ""),
        deliveryEstimate: s.tiers[1][3],
        image: PICTURES[slug] ? `/demo/${PICTURES[slug]}.png` : null,
        isPublished: true,
        isFeatured: !!s.featured,
        fulfillmentType: "MANUAL",
        fields: [linkField(post)],
        tags: [`kind:${s.kind}`],
        sortOrder: order++,
        variants: {
          create: s.tiers.map(([name, type, rate, avg, risk, refillDays, min, max, drip, desc], i) => ({
            name,
            priceHtg: htg(rate),
            sortOrder: i,
            service: { type, min, max, avg, risk, refillDays, drip, desc, info: infoFromProvider(name.fr ?? "", desc) } satisfies ServiceMeta,
          })),
        },
      },
    });
  }
  for (const p of PACKS) {
    if (await prisma.product.findUnique({ where: { slug: p.slug } })) continue;
    const pack = [];
    for (const [slug, quantity] of p.contents) {
      const v = await prisma.productVariant.findFirst({ where: { product: { slug } }, orderBy: { sortOrder: "asc" } });
      if (v) pack.push({ variantId: v.id, quantity });
    }
    await prisma.product.create({
      data: {
        slug: p.slug,
        categoryId: cats.pake,
        name: p.name,
        description: p.items,
        accent: p.accent,
        isPublished: true,
        fulfillmentType: "MANUAL",
        fields: [linkField(false)],
        sortOrder: order++,
        variants: { create: [{ name: L("Pake a", "Le pack"), priceHtg: htg(p.old), salePriceHtg: htg(p.price), sortOrder: 0, service: { pack } }] },
      },
    });
  }
  return { categories: categories.length, products: SERVICES.length + PACKS.length };
}
