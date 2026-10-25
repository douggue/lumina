/** Starter pack arithmetic (shared by the pack order screen and the server). */

export type PackConfig = { items: { variantId: string; quantity: number }[]; discountPct: number; maxVideos: number; newOnly: boolean };

type Line = { quantity: number; rate: number; post: boolean; meta: { min: number } };

/** Price per line is per 1,000 (HTG centimes). Separate = buying each service alone; price = with the pack discount. */
export function packPrice(lines: Pick<Line, "quantity" | "rate">[], discountPct: number) {
  const separate = lines.reduce((a, l) => a + Math.round((l.rate * l.quantity) / 1000), 0);
  const price = Math.max(0, Math.round((separate * (100 - discountPct)) / 100 / 100) * 100);
  return { separate, price };
}

/** Splits a total over n parts as evenly as possible; the remainder goes to the first ones. */
export function splitEvenly(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i < total % n ? 1 : 0));
}

/** How many videos the likes/views can be spread over: each piece must still meet the provider's minimum. */
export function maxVideosFor(lines: Line[], cap: number) {
  const post = lines.filter((l) => l.post);
  if (!post.length) return 0;
  return Math.max(1, Math.min(cap, ...post.map((l) => Math.floor(l.quantity / Math.max(1, l.meta.min)))));
}

/** "@mika" from a TikTok profile or video link (other platforms don't name the account in video links). */
export function tiktokHandle(url: string) {
  return /tiktok\.com\/@([^/?#]+)/i.exec(url)?.[1]?.toLowerCase() ?? null;
}
