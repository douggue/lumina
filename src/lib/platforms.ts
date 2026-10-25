import { norm } from "./search";

/** Small icon in front of a product tag (Android, PC, region…). Any tag the admin types works; unknown ones just have no icon. */
const ICONS: [RegExp, string][] = [
  [/\bandroid\b/, "🤖"],
  [/\b(ios|iphone|ipad|apple)\b/, "📱"],
  [/\b(pc|windows|steam)\b/, "💻"],
  [/\b(playstation|ps4|ps5|psn)\b/, "🕹️"],
  [/\bxbox\b/, "🎮"],
  [/\b(nintendo|switch)\b/, "🍄"],
  [/\b(web|online|global)\b/, "🌐"],
  [/\b(us|usa)\b/, "🇺🇸"],
  [/\b(haiti|ht)\b/, "🇭🇹"],
];

export function tagIcon(tag: string): string {
  const n = norm(tag);
  return ICONS.find(([re]) => re.test(n))?.[1] ?? "";
}
