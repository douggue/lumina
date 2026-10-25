import { describe, expect, it } from "vitest";
import { amountInRange, customerRate, exchangeFee, isExchangeProduct, quoteAmount } from "@/lib/amount";
import { DEFAULT_EXCHANGE, steppedTiers } from "@/lib/amount";

const p = { ...DEFAULT_EXCHANGE, categoryId: "cat-exchange" }; // 130 + 10, $2 up to $40 then +$1 every $40, 4% over $400

describe("money exchange pricing", () => {
  it("customer rate is market rate + margin", () => {
    expect(customerRate(p)).toBe(140);
  });

  it("fee goes up $1 every $40, then 4% over $400", () => {
    expect(steppedTiers()).toHaveLength(10);
    expect(exchangeFee(p, 500)).toBe(200); // $5 → $2
    expect(exchangeFee(p, 4000)).toBe(200); // $40 → $2
    expect(exchangeFee(p, 4001)).toBe(300); // $40.01 → $3
    expect(exchangeFee(p, 8000)).toBe(300); // $80 → $3
    expect(exchangeFee(p, 10000)).toBe(400); // $100 → $4
    expect(exchangeFee(p, 40000)).toBe(1100); // $400 → $11
    expect(exchangeFee(p, 50000)).toBe(2000); // $500 → 4% = $20
  });

  it("$30 at 140 with a $2 fee = 4 480 HTG", () => {
    expect(quoteAmount(p, 3000)).toEqual({ amount: 3000, fee: 200, totalUsd: 3200, totalHtg: 448000, rate: 140 });
  });

  it("rounds the HTG price up to the whole gourde", () => {
    expect(quoteAmount({ ...p, margin: 9.37 }, 1000).totalHtg).toBe(Math.ceil((1200 * 139.37) / 100) * 100);
  });

  it("applies to the exchange category and its subcategories only", () => {
    expect(isExchangeProduct(p, { id: "cat-exchange", parentId: null })).toBe(true);
    expect(isExchangeProduct(p, { id: "cat-meru", parentId: "cat-exchange" })).toBe(true);
    expect(isExchangeProduct(p, { id: "cat-games", parentId: null })).toBe(false);
    expect(isExchangeProduct({ ...p, categoryId: null }, { id: "cat-exchange", parentId: null })).toBe(false);
  });

  it("enforces the minimum and maximum", () => {
    expect(amountInRange(p, 499)).toBe(false);
    expect(amountInRange(p, 500)).toBe(true);
    expect(amountInRange(p, p.max + 1)).toBe(false);
  });
});
