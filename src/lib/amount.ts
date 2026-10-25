/**
 * Money exchange products (Meru, account top-ups…): every product in the exchange category (Admin → Money exchange).
 * The customer types a USD amount. Fee = the fee table; rate = market rate + margin.
 * Pure functions: the product page shows the quote, the server recomputes it when the order is placed.
 */
/** USD amounts in cents. Customer rate = market rate + margin. Applies to every product in the exchange category. */
export type ExchangePricing = {
  /** Products in this category (and its subcategories) are exchange products. null = none yet. */
  categoryId: string | null;
  marketRate: number;
  margin: number;
  /** Smallest and largest amount a customer can ask for, USD cents */
  min: number;
  max: number;
  /** Quick amount buttons, whole USD */
  presets: number[];
  /** Sorted by upTo: the first row whose upTo is at or above the amount gives the fee */
  tiers: { upTo: number; fee: number }[];
  /** Fee in % for amounts above the last row */
  abovePercent: number;
};

/** $5–$40 → $2, then +$1 for every $40 more, up to $400. */
export function steppedTiers(step = 4000, until = 40000, firstFee = 200, increase = 100) {
  const tiers: { upTo: number; fee: number }[] = [];
  for (let upTo = step, fee = firstFee; upTo <= until; upTo += step, fee += increase) tiers.push({ upTo, fee });
  return tiers;
}

export const DEFAULT_EXCHANGE: ExchangePricing = {
  categoryId: null,
  marketRate: 130,
  margin: 10,
  min: 500,
  max: 200000,
  presets: [10, 25, 50, 100],
  tiers: steppedTiers(),
  abovePercent: 4,
};

export type AmountQuote = { amount: number; fee: number; totalUsd: number; totalHtg: number; rate: number };

/** A product is an exchange product when it sits in the exchange category or one of its subcategories. */
export function isExchangeProduct(p: ExchangePricing, category: { id: string; parentId: string | null } | null | undefined) {
  return !!p.categoryId && !!category && (category.id === p.categoryId || category.parentId === p.categoryId);
}

/** Rate the customer gets: market rate + your margin (HTG per USD). */
export function customerRate(p: ExchangePricing) {
  return Math.round((p.marketRate + p.margin) * 100) / 100;
}

/** Fee in USD cents from the table; above the last row, a percentage of the amount. */
export function exchangeFee(p: ExchangePricing, amount: number) {
  const row = [...p.tiers].sort((a, b) => a.upTo - b.upTo).find((t) => amount <= t.upTo);
  return row ? row.fee : Math.round((amount * p.abovePercent) / 100);
}

/** Amount in USD cents → fee, total in USD cents and total in HTG centimes (rounded up to the whole gourde). */
export function quoteAmount(p: ExchangePricing, amount: number): AmountQuote {
  const rate = customerRate(p);
  const fee = exchangeFee(p, amount);
  const totalUsd = amount + fee;
  const totalHtg = Math.ceil((totalUsd * rate) / 100 - 1e-9) * 100;
  return { amount, fee, totalUsd, totalHtg, rate };
}

export function amountInRange(p: ExchangePricing, amount: number) {
  return Number.isInteger(amount) && amount >= p.min && amount <= p.max;
}
