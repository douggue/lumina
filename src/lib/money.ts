import type { Currency } from "@prisma/client";

// "en" is used by the English back office.
const intlLocale: Record<string, string> = { ht: "fr-HT", fr: "fr-HT", en: "en-US" };

/** Format integer minor units (centimes / cents) for display. Gourdes the Haitian way, amount first: "1,250 HTG" (or "12.50 HTG"). */
export function formatMoney(minor: number, currency: Currency, locale = "ht"): string {
  const value = minor / 100;
  if (currency === "HTG") {
    const n = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(value));
    return `${value < 0 ? "−" : ""}${n} HTG`;
  }
  return new Intl.NumberFormat(intlLocale[locale] ?? "en-US", { style: "currency", currency: "USD" }).format(value);
}

/** Convert an HTG amount (centimes) to USD cents at `htgPerUsd`, rounded to the nearest cent. */
export function htgToUsd(htgMinor: number, htgPerUsd: number): number {
  return Math.round(htgMinor / htgPerUsd);
}

/** Convert USD cents to HTG centimes at `htgPerUsd`. */
export function usdToHtg(usdMinor: number, htgPerUsd: number): number {
  return Math.round(usdMinor * htgPerUsd);
}

/** Price of an HTG-based amount in the requested currency. */
export function priceIn(htgMinor: number, currency: Currency, htgPerUsd: number): number {
  return currency === "HTG" ? htgMinor : htgToUsd(htgMinor, htgPerUsd);
}

/** Parse a user-entered decimal amount ("1,250.50") into minor units. Returns null if invalid. */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[\s,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}
