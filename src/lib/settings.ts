import { cache } from "react";
import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "./db";
import { DEFAULT_EXCHANGE, type ExchangePricing } from "./amount";
import { DEFAULT_BLOCKED, DEFAULT_RISK_RULES, type RiskRule } from "./service-risk";

export type RefTier = { key: string; name: Record<string, string>; pct: number; minActive: number; minVolume: number };

export type Settings = {
  /** Recent sales popup on the products ticked in Admin → Trust */
  salesPopupEnabled: boolean;
  /** Popups per visit (2–3 feels natural; max 5) */
  salesPopupPerVisit: number;
  /** "Stock is low" shows when a code product has this many codes left or fewer (mode "auto") */
  lowStockLimit: number;
  /** HTG per 1 USD (mid rate) */
  htgPerUsd: number;
  /** Exchange spread applied against the customer, in basis points */
  exchangeSpreadBps: number;
  /** Flat exchange fee in basis points of the source amount */
  exchangeFeeBps: number;
  exchangeQuoteSeconds: number;
  minDepositHtg: number;
  maxDepositHtg: number;
  /** Manual deposits at or above this amount are held before becoming spendable */
  holdThresholdHtg: number;
  holdHours: number;
  /** Accounts younger than this many days get lower limits */
  newAccountDays: number;
  newAccountDailyLimitHtg: number;
  /** Orders at or above this total go to manual review before codes are released */
  reviewOrderThresholdHtg: number;
  natcashRecipientName: string;
  natcashRecipientPhone: string;
  natcashInstructions: Record<string, string>;
  /** Optional NatCash QR image customers scan on the deposit page */
  natcashQrUrl: string;
  moncashEnabled: boolean;
  natcashEnabled: boolean;
  whatsappNumber: string;
  supportHours: string;
  businessAddress: string;
  businessName: string;
  socialFacebook: string;
  socialInstagram: string;
  socialTiktok: string;
  /** Community links bar (Account, Help, footer): each icon shows only when its link is set */
  socialWhatsappChannel: string;
  socialTelegram: string;
  socialYoutube: string;
  reviewsGoogle: string;
  reviewsTrustpilot: string;
  announcement: { enabled: boolean; text: Record<string, string>; link: string; startsAt?: string; endsAt?: string };
  /** Header and footer links (Admin → Navigation). Empty = built-in links. */
  navigation: { header: NavLink[]; footer: NavLink[] };
  newsletterEnabled: boolean;
  /** Customers must confirm their email before ordering, depositing or exchanging (only while email sending is on) */
  requireEmailVerification: boolean;
  /** New accounts on a browser already used by this many other accounts are flagged for review */
  maxAccountsPerDevice: number;
  /** Brand images (URLs). Empty = built-in logo / default artwork. */
  logoUrl: string;
  logoDarkUrl: string;
  /** Wallet adjustments at or above this HTG-equivalent amount need a second staff approval */
  approvalThresholdHtg: number;
  /** Paid orders not delivered after this many hours are refunded to the wallet automatically (0 = off) */
  autoRefundHours: number;
  referralEnabled: boolean;
  /** Free trial: on/off, "first top-up required" switch, daily limits, and the offers customers pick from */
  trialEnabled: boolean;
  trialStrict: boolean;
  trialPerDay: number;
  trialPerIpPerDay: number;
  trialOffers: { key: string; product: string; tier: number; quantity: number; label: Record<string, string>; avg: Record<string, string> }[];
  /** Services status per platform (category slug) shown on the help page and home bar; missing = normal */
  serviceStatus: Record<string, "ok" | "slow" | "pause">;
  /** Risk analysis (Admin → Services & risk): clue rules and words that block a provider service */
  riskRules: RiskRule[];
  riskBlocked: string[];
  /** "Learned from real orders" suggestions staff ignored: choice id → date (hidden for 30 days) */
  riskLearnIgnored: Record<string, string>;
  /** Pricing (Admin → Pricing & profit): payment fee %, warning under this profit %, pause choices that lose money */
  paymentFeePct: number;
  minProfitPct: number;
  /** Profit % aimed for when a price is suggested (worst case, like the profit table) */
  targetProfitPct: number;
  autoPauseLoss: boolean;
  referralRewardHtg: number;
  /** Referral tiers over the last 30 days: reach minActive friends with a completed order, or minVolume (HTG centimes) of their orders */
  refTiers: RefTier[];
  /** Days a commission waits after the order completes before it can be withdrawn */
  refHoldDays: number;
  /** Smallest withdrawal to MonCash / NatCash (HTG centimes); moving earnings to the wallet has no minimum */
  refMinPayoutHtg: number;
  /** Months a friend's orders earn commission after they sign up (0 = for life) */
  refMonths: number;
  referralMinOrderHtg: number;
  heroImageUrl: string;
  ogImageUrl: string;
  homepage: unknown;
  homepageDraft: unknown;
  homepageHistory: { at: string; by: string; config: unknown }[];
  theme: ThemeConfig;
  themeHistory: { at: string; by: string; theme: ThemeConfig }[];
  /** Rate and fee table shared by every "customer enters the amount" product (Admin → Money exchange) */
  moneyExchange: ExchangePricing;
};

export type { ExchangePricing } from "./amount";

export type NavLink = { label: Record<string, string>; href: string };

export type MotionStyle = "calm" | "lively" | "neon";

export type ThemeConfig = {
  /** Accent in light mode (buttons, links) */
  primary: string;
  /** Accent in dark mode */
  primaryDark: string;
  /** Dark mode cards and panels */
  navy: string;
  /** Dark mode page background and the hero */
  midnight: string;
  /** Light mode page background */
  lightBg: string;
  radius: number;
  /** Master switch; visitors who ask for reduced motion never get animations */
  animations: boolean;
  /** What visitors see before they pick light or dark themselves */
  defaultMode: "dark" | "light";
  motion: MotionStyle;
  /** Strength of the accent glow behind the hero, cards and buttons (0 = off, 100 = strong) */
  glow: number;
  /** "bold" = extra-bold display weight for headings, "plain" = the body weight everywhere */
  displayFont: "bold" | "plain";
  heroGrid: boolean;
  /** Words in the scrolling band under the hero, per language, separated by commas. Empty = no band. */
  marquee: Record<string, string>;
};

export const DEFAULT_THEME: ThemeConfig = {
  primary: "#0F172A",
  primaryDark: "#5470F0",
  navy: "#111A2E",
  midnight: "#0A0F1C",
  lightBg: "#F5F6FB",
  radius: 14,
  animations: true,
  defaultMode: "light",
  motion: "calm",
  glow: 0,
  displayFont: "bold",
  heroGrid: false,
  marquee: {
    ht: "Abòne, Like, Vi, Live, Kòmantè, MonCash, NatCash",
    fr: "Abonnés, Likes, Vues, Live, Commentaires, MonCash, NatCash",
  },
};

/** Saved themes from before these settings existed get the new defaults for anything missing. */
export function fullTheme(t: Partial<ThemeConfig> | undefined): ThemeConfig {
  return { ...DEFAULT_THEME, ...(t ?? {}), marquee: { ...DEFAULT_THEME.marquee, ...(t?.marquee ?? {}) } };
}

// Amounts in minor units (centimes).
export const DEFAULT_SETTINGS: Settings = {
  salesPopupEnabled: true,
  salesPopupPerVisit: 3,
  lowStockLimit: 5,
  htgPerUsd: 131.5,
  exchangeSpreadBps: 150,
  exchangeFeeBps: 0,
  exchangeQuoteSeconds: 120,
  minDepositHtg: 10_000,
  maxDepositHtg: 10_000_000,
  holdThresholdHtg: 2_500_000,
  holdHours: 24,
  newAccountDays: 3,
  newAccountDailyLimitHtg: 1_500_000,
  reviewOrderThresholdHtg: 2_000_000,
  natcashRecipientName: "HaitiViral",
  natcashRecipientPhone: "+509 0000 0000",
  natcashInstructions: {},
  natcashQrUrl: "",
  moncashEnabled: true,
  natcashEnabled: true,
  whatsappNumber: "50900000000",
  supportHours: "Lun–Sam 8:00–20:00",
  businessAddress: "Port-au-Prince, Haïti",
  businessName: "HaitiViral",
  socialFacebook: "",
  socialInstagram: "",
  socialTiktok: "",
  socialWhatsappChannel: "",
  socialTelegram: "",
  socialYoutube: "",
  reviewsGoogle: "",
  reviewsTrustpilot: "",
  announcement: { enabled: false, text: {}, link: "" },
  logoUrl: "",
  logoDarkUrl: "",
  approvalThresholdHtg: 1_000_000,
  autoRefundHours: 96,
  referralEnabled: true,
  serviceStatus: {},
  riskRules: DEFAULT_RISK_RULES,
  riskBlocked: DEFAULT_BLOCKED,
  riskLearnIgnored: {},
  paymentFeePct: 3,
  minProfitPct: 15,
  targetProfitPct: 40,
  autoPauseLoss: true,
  trialEnabled: true,
  trialStrict: false,
  trialPerDay: 30,
  trialPerIpPerDay: 3,
  trialOffers: [
    { key: "tt-views", product: "tiktok-views", tier: 0, quantity: 100, label: { ht: "100 vi TikTok", fr: "100 vues TikTok" }, avg: { ht: "10 minit", fr: "10 minutes" } },
    { key: "ig-likes", product: "instagram-likes", tier: 0, quantity: 20, label: { ht: "20 like Instagram", fr: "20 likes Instagram" }, avg: { ht: "25 minit", fr: "25 minutes" } },
    { key: "yt-views", product: "youtube-views", tier: 0, quantity: 100, label: { ht: "100 vi YouTube", fr: "100 vues YouTube" }, avg: { ht: "1 èdtan", fr: "1 heure" } },
  ],
  referralRewardHtg: 10_000,
  refTiers: [
    { key: "bronze", name: { ht: "Bwonz", fr: "Bronze" }, pct: 5, minActive: 0, minVolume: 0 },
    { key: "silver", name: { ht: "Ajan", fr: "Argent" }, pct: 7, minActive: 5, minVolume: 1_000_000 },
    { key: "gold", name: { ht: "Lò", fr: "Or" }, pct: 10, minActive: 20, minVolume: 5_000_000 },
    { key: "diamond", name: { ht: "Dyaman", fr: "Diamant" }, pct: 12, minActive: 50, minVolume: 15_000_000 },
  ],
  refHoldDays: 3,
  refMinPayoutHtg: 100_000,
  refMonths: 0,
  referralMinOrderHtg: 50_000,
  heroImageUrl: "",
  ogImageUrl: "",
  homepage: null,
  homepageDraft: null,
  homepageHistory: [],
  theme: DEFAULT_THEME,
  themeHistory: [],
  navigation: { header: [], footer: [] },
  newsletterEnabled: false,
  requireEmailVerification: true,
  maxAccountsPerDevice: 3,
  moneyExchange: DEFAULT_EXCHANGE,
};

export async function getSettings(): Promise<Settings> {
  const rows = await prisma.siteSetting.findMany();
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) merged[r.key] = r.value;
  return merged as Settings;
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await prisma.siteSetting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
  try {
    revalidateTag("settings");
  } catch {
    // outside a Next.js request (seed/scripts): the 60-second expiry covers it
  }
}

/**
 * Cached copy for rendering public pages (logo, menus, announcement, contact numbers).
 * Refreshed as soon as staff save settings, and at most 60 seconds old otherwise.
 * Money paths (deposits, exchange, limits, checkout) keep using getSettings(), which always reads the database.
 */
const cachedSettings = unstable_cache(getSettings, ["site-settings"], { tags: ["settings"], revalidate: 60 });
// Merged over the defaults so a cached copy from before a new setting existed still has it.
export const getDisplaySettings = cache(async (): Promise<Settings> => ({ ...DEFAULT_SETTINGS, ...(await cachedSettings()) }));
