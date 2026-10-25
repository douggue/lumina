import type { Kind, Risk } from "./services";

/**
 * Risk suggestion from the provider's own words (service name, description, category) and the service kind.
 * Each rule adds or removes points when one of its words appears; longer phrases are matched first and then
 * removed from the text, so "no refill" counts once as "no refill" and not again as "refill".
 * Score ≤ −2 = low · −1 to +1 = medium · ≥ +2 = high. Blocked words (fake reviews, account sales…) = never sold.
 * Staff edit the rules in Admin → Services & risk, and can override and lock any level.
 */
export type RiskRule = { words: string[]; points: number };
export type RiskLevel = Risk | "blocked";
export type RiskResult = { level: RiskLevel; score: number; why: string[] };

export const DEFAULT_RISK_RULES: RiskRule[] = [
  { words: ["bot", "fake"], points: 3 },
  { words: ["kind:followers", "kind:subscribers", "kind:members"], points: 1 },
  { words: ["kind:views", "kind:live", "impressions", "live viewers"], points: -2 },
  { words: ["no refill", "no guarantee", "without refill", "non refill"], points: 2 },
  { words: ["not working", "unstable", "test"], points: 2 },
  { words: ["drop"], points: 1 },
  { words: ["instant", "super fast", "speed:fast"], points: 1 },
  { words: ["speed:slow"], points: -1 },
  { words: ["cheap", "lq", "low quality", "mixed"], points: 1 },
  { words: ["real", "active", "organic"], points: -2 },
  { words: ["refill", "r30", "r60", "r90", "lifetime", "guarantee", "guaranteed"], points: -2 },
  { words: ["non drop", "no drop", "low drop", "nondrop"], points: -1 },
  { words: ["hq", "high quality", "premium", "vip"], points: -1 },
];

export const DEFAULT_BLOCKED = ["google reviews", "google custom reviews", "trustpilot", "app store reviews", "play store reviews", "account sale", "accounts for sale"];

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9/+:%-]+/g, " ").replace(/\s+/g, " ").trim()} `;

export function analyzeRisk(input: { name: string; desc?: string | null; category?: string | null; kind?: Kind | null }, rules: RiskRule[] = DEFAULT_RISK_RULES, blocked: string[] = DEFAULT_BLOCKED): RiskResult {
  const plain = norm([input.category, input.name, input.desc].filter(Boolean).join(" "));
  const hit = blocked.map((b) => b.trim().toLowerCase()).find((b) => b && plain.includes(norm(b)));
  if (hit) return { level: "blocked", score: 0, why: [`blocked: ${hit}`] };

  // Speed written as "10-50K/Day" or "50-500/Day": 10K+ a day counts as fast, under 1K as slow.
  const speed = /(\d+(?:\.\d+)?)\s*(k|m)?\s*\/\s*(day|d)\b/.exec(plain);
  const perDay = speed ? Number(speed[1]) * (speed[2] === "m" ? 1_000_000 : speed[2] === "k" ? 1_000 : 1) : null;
  const tags = [input.kind && `kind:${input.kind}`, perDay !== null && perDay >= 10_000 && "speed:fast", perDay !== null && perDay < 1_000 && "speed:slow"].filter(Boolean);
  let text = `${plain}${tags.join(" ")} `;
  const all = rules.flatMap((r) => r.words.map((w) => ({ w: w.trim().toLowerCase(), points: r.points }))).filter((x) => x.w);
  all.sort((a, b) => b.w.length - a.w.length);
  let score = 0;
  const why: string[] = [];
  const counted = new Set<string>();
  for (const { w, points } of all) {
    const needle = norm(w);
    if (!text.includes(needle)) continue;
    text = text.split(needle).join(" ");
    // One word of a rule is enough: "refill" and "R30" in the same name count once.
    const rule = rules.find((r) => r.words.some((x) => x.trim().toLowerCase() === w));
    const key = rule ? rule.words.join("|") : w;
    if (counted.has(key)) continue;
    counted.add(key);
    score += points;
    why.push(`${points > 0 ? "+" : "−"}${Math.abs(points)} ${w}`);
  }
  return { level: score <= -2 ? "low" : score >= 2 ? "high" : "med", score, why: why.length ? why : ["no clues found"] };
}

/** Rules as editable text, one per line: "+3 bot, fake". */
export function rulesToText(rules: RiskRule[]) {
  return rules.map((r) => `${r.points > 0 ? "+" : ""}${r.points} ${r.words.join(", ")}`).join("\n");
}

export function rulesFromText(text: string): RiskRule[] {
  return text
    .split("\n")
    .map((l) => /^\s*([+\-−]?\d+)\s+(.+)$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ points: Number(m[1].replace("−", "-")), words: m[2].split(",").map((w) => w.trim()).filter(Boolean) }))
    .filter((r) => r.words.length && Number.isFinite(r.points) && r.points !== 0);
}
