import { cleanInfo, type ServiceInfo } from "./service-info";

/**
 * Social media services: shared by the order screen (browser) and the server, so both apply the same rules.
 * A product is one platform + service kind (e.g. TikTok followers); each option is a choice
 * (Bon mache / Pi bon kalite / Rapid) whose priceHtg is the price per 1,000 and whose `service` JSON holds the rest.
 */

export type ServiceType = "default" | "comments" | "commentLikes" | "live" | "liveComments";
export type Risk = "low" | "med" | "high";
export type Kind = "followers" | "likes" | "views" | "comments" | "live";

export type ServiceMeta = {
  type: ServiceType;
  min: number;
  max: number;
  /** Average delivery time shown to customers, per language */
  avg: Record<string, string>;
  risk: Risk;
  /** 0 = no refill */
  refillDays: number;
  drip: boolean;
  /** The provider's own description: admin only (customers never see the provider's words, name or number) */
  desc?: string;
  /** Short description for customers, per language (editable in Admin → Services & risk) */
  about?: Record<string, string>;
  /** Details card on the order screen: quality, speed, start, drop, location, cancel */
  info?: ServiceInfo;
  /** Only this kind of post (Instagram reels, YouTube Shorts or normal videos); none = any post */
  postType?: PostType;
  /** Staff set the risk level by hand: "Re-analyze all" leaves it alone */
  riskLocked?: boolean;
  /** Turned off by the risk analysis (blocked words) or because it sold at a loss: turned back on automatically when fixed */
  blocked?: boolean;
  pausedLoss?: boolean;
};

export const LIVE_DURATIONS = [15, 30, 60, 120] as const;
export const DRIP_RUNS = 5;
export const DRIP_INTERVAL_MIN = 60;
export const MAX_COMMENT_LENGTH = 300;

export function parseMeta(v: unknown): ServiceMeta | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Partial<ServiceMeta>;
  if (!m.type || typeof m.min !== "number" || typeof m.max !== "number") return null;
  return {
    type: m.type,
    min: m.min,
    max: m.max,
    avg: m.avg ?? {},
    risk: m.risk ?? "med",
    refillDays: m.refillDays ?? 0,
    drip: !!m.drip,
    desc: m.desc,
    about: m.about && typeof m.about === "object" ? m.about : undefined,
    info: cleanInfo(m.info),
    postType: m.postType === "reel" || m.postType === "shorts" || m.postType === "video" ? m.postType : undefined,
    riskLocked: !!m.riskLocked,
    blocked: !!m.blocked,
    pausedLoss: !!m.pausedLoss,
  };
}

/** Service kind of a product, from its "kind:…" tag. */
export function productKind(tags: string[]): Kind | null {
  const tag = tags.find((t) => t.startsWith("kind:"))?.slice(5);
  return tag && ["followers", "likes", "views", "comments", "live"].includes(tag) ? (tag as Kind) : null;
}

export const KIND_ORDER: Kind[] = ["followers", "likes", "views", "comments", "live"];

/** Platforms the site knows how to check links for (category slugs). */
export const PLATFORMS: Record<string, { name: string; letter: string; color: string }> = {
  tiktok: { name: "TikTok", letter: "TT", color: "#111111" },
  instagram: { name: "Instagram", letter: "IG", color: "#C13584" },
  youtube: { name: "YouTube", letter: "YT", color: "#CC0000" },
  facebook: { name: "Facebook", letter: "FB", color: "#1877F2" },
  x: { name: "X", letter: "X", color: "#333333" },
  telegram: { name: "Telegram", letter: "TG", color: "#2481CC" },
};

type LinkRule = { host: RegExp; post: RegExp; shortHosts: RegExp; profileEx: string; postEx: string };
const RULES: Record<string, LinkRule> = {
  tiktok: { host: /(^|\.)tiktok\.com$/, post: /\/(video|photo|live)\//, shortHosts: /^(vm|vt)\.tiktok\.com$/, profileEx: "https://www.tiktok.com/@non", postEx: "https://www.tiktok.com/@non/video/123…" },
  instagram: { host: /(^|\.)instagram\.com$/, post: /^\/(p|reel|reels|tv)\//, shortHosts: /^$/, profileEx: "https://www.instagram.com/non", postEx: "https://www.instagram.com/reel/ABC…" },
  youtube: { host: /(^|\.)(youtube\.com|youtu\.be)$/, post: /^\/(watch|shorts\/|live\/)/, shortHosts: /^youtu\.be$/, profileEx: "https://www.youtube.com/@chen", postEx: "https://www.youtube.com/watch?v=…" },
  facebook: { host: /(^|\.)(facebook\.com|fb\.watch)$/, post: /\/(videos|reel|watch|posts|share\/[rv])\b/, shortHosts: /^fb\.watch$/, profileEx: "https://www.facebook.com/paj", postEx: "https://www.facebook.com/reel/123…" },
  x: { host: /(^|\.)(x\.com|twitter\.com)$/, post: /\/status\//, shortHosts: /^$/, profileEx: "https://x.com/non", postEx: "https://x.com/non/status/123…" },
  telegram: { host: /(^|\.)(t\.me|telegram\.me)$/, post: /^\/[^/]+\/\d+/, shortHosts: /^$/, profileEx: "https://t.me/chanel", postEx: "https://t.me/chanel/123" },
};

/** What kind of link a service needs: a profile (followers, live) or a video/post (likes, views, comments). */
export function wantsPost(kind: Kind | null, type: ServiceType) {
  if (type === "live" || type === "liveComments") return false;
  if (type === "comments" || type === "commentLikes") return true;
  return kind === "likes" || kind === "views";
}

export function linkExample(platform: string, post: boolean) {
  const r = RULES[platform];
  return r ? (post ? r.postEx : r.profileEx) : "https://…";
}

export type LinkCheck = { ok: true; url: string } | { ok: false; error: "empty" | "not_platform" | "need_post" | "need_profile" | "need_reel" | "need_shorts" | "need_video" };
/** Which kind of post a service accepts, set per choice in Admin → Services & risk (default: any post). */
export type PostType = "reel" | "shorts" | "video";

/** Profile address built from a username ("@mika" or "mika"), for services that need a profile. */
const PROFILE_URL: Record<string, (name: string) => string> = {
  tiktok: (n) => `https://www.tiktok.com/@${n}`,
  instagram: (n) => `https://www.instagram.com/${n}`,
  youtube: (n) => `https://www.youtube.com/@${n}`,
  facebook: (n) => `https://www.facebook.com/${n}`,
  x: (n) => `https://x.com/${n}`,
  telegram: (n) => `https://t.me/${n}`,
};

/** True for share links that hide where they go (vm.tiktok.com, fb.watch): the server opens them to find out. */
export function isShortLink(url: string, platform: string) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
    return platform !== "youtube" && !!RULES[platform]?.shortHosts.test(host);
  } catch {
    return false;
  }
}

/**
 * Checks a pasted link: right platform, and a profile or a video as the service needs. Tracking extras are dropped.
 * A bare username ("@mika") is turned into the profile link. Short share links can't be read in the browser, so they
 * pass here and the server opens them (link-resolve.ts) to check what they really point to.
 */
export function checkLink(raw: string, platform: string, post: boolean, postType?: PostType): LinkCheck {
  const text = raw.trim();
  if (!text) return { ok: false, error: "empty" };
  const rule = RULES[platform];
  const handle = /^@?([A-Za-z0-9._-]{2,40})$/.exec(text);
  // "@mika" or "mika" (a dot without "@" looks like a web address, e.g. "tiktok.com", so it is read as a link)
  if (handle && (text.startsWith("@") || !text.includes("."))) {
    if (post || !PROFILE_URL[platform]) return { ok: false, error: post ? "need_post" : "not_platform" };
    return { ok: true, url: PROFILE_URL[platform](handle[1]) };
  }
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, error: "not_platform" };
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  if (!rule || !rule.host.test(host)) return { ok: false, error: "not_platform" };
  const short = rule.shortHosts.test(host);
  // youtu.be is always a video; other short links are checked on the server once opened.
  const isPost = (short && platform === "youtube") || rule.post.test(u.pathname);
  if (!short || platform === "youtube") {
    if (post && !isPost) return { ok: false, error: "need_post" };
    if (!post && isPost && !/\/live(\/|$)/.test(u.pathname)) return { ok: false, error: "need_profile" };
  }
  if (post && postType && !(short && platform !== "youtube")) {
    const path = u.pathname;
    if (postType === "reel" && !/^\/(reel|reels|tv)\//.test(path) && !/\/reel\//.test(path)) return { ok: false, error: "need_reel" };
    if (postType === "shorts" && !/^\/shorts\//.test(path)) return { ok: false, error: "need_shorts" };
    if (postType === "video" && (/^\/shorts\//.test(path) || /\/reel\//.test(path))) return { ok: false, error: "need_video" };
  }
  for (const k of [...u.searchParams.keys()]) if (/^(igsh|igshid|utm_|si$|_r$|_t$|is_from_webapp|sender_device|feature)/.test(k)) u.searchParams.delete(k);
  u.hash = "";
  u.protocol = "https:";
  return { ok: true, url: u.toString() };
}

/** One comment per line; blank lines and repeats removed. */
export function parseComments(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const c = line.trim().slice(0, MAX_COMMENT_LENGTH);
    if (!c || seen.has(c.toLowerCase())) continue;
    seen.add(c.toLowerCase());
    out.push(c);
  }
  return out;
}

/** Price in HTG centimes: price per 1,000 × quantity ÷ 1,000 (× duration ÷ 30 min for live viewers). At least 1 gourde. */
export function servicePrice(ratePer1000: number, quantity: number, type: ServiceType, durationMin = 30) {
  const mult = type === "live" ? durationMin / 30 : 1;
  return Math.max(100, Math.round((ratePer1000 * quantity * mult) / 1000));
}
