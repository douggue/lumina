import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
import { smmOutcome } from "@/lib/suppliers/smm";
import { lineQuantity, partialRefund, serviceIdFor } from "@/lib/suppliers/smm-orders";
import { profitOf } from "@/lib/suppliers/catalog";
import { analyzeRisk, rulesFromText, rulesToText, DEFAULT_RISK_RULES } from "@/lib/service-risk";

describe("SMM provider statuses", () => {
  it("maps provider words to our outcomes", () => {
    expect(smmOutcome("Completed")).toBe("done");
    expect(smmOutcome("Partial")).toBe("partial");
    expect(smmOutcome("Canceled")).toBe("canceled");
    expect(smmOutcome("cancelled")).toBe("canceled");
    expect(smmOutcome("In progress")).toBe("running");
    expect(smmOutcome("Pending")).toBe("running");
    expect(smmOutcome("Weird")).toBe("unknown");
  });
});

describe("partial refunds", () => {
  it("gives back the undelivered share, never more than the line", () => {
    expect(partialRefund(30000, 1000, 300)).toBe(9000);
    expect(partialRefund(30000, 1000, 0)).toBe(0);
    expect(partialRefund(30000, 1000, 5000)).toBe(30000);
    expect(partialRefund(100, 3, 1)).toBe(33);
    expect(partialRefund(30000, 0, 10)).toBe(0);
  });
  it("reads the ordered quantity from the line fields", () => {
    expect(lineQuantity({ quantity: "1500" })).toBe(1500);
    expect(lineQuantity({})).toBe(0);
  });
});

describe("provider service ids", () => {
  it("uses the plain id, or the one for the live duration", () => {
    expect(serviceIdFor(" 101 ", {})).toBe("101");
    expect(serviceIdFor("15=201,30=202,60=203", { durationMin: "60" })).toBe("203");
    expect(serviceIdFor("15=201,30=202", {})).toBe("202");
    expect(serviceIdFor("15=201,30=202", { durationMin: "120" })).toBe("");
  });
});

describe("real profit", () => {
  const s = { htgPerUsd: 131.5, paymentFeePct: 3, minProfitPct: 15 };
  it("counts the biggest VIP discount and the payment fee", () => {
    const p = profitOf(42000, 1.8, s); // 420 HTG per 1K, provider $1.80
    expect(p.costHtg).toBe(23670);
    expect(p.vip).toBe(3360);
    expect(p.fee).toBe(1159);
    expect(p.profit).toBe(42000 - 3360 - 1159 - 23670);
    expect(p.status).toBe("ok");
  });
  it("flags losses and low margins", () => {
    expect(profitOf(26000, 1.8, s).status).toBe("loss");
    expect(profitOf(30000, 1.8, s).status).toBe("low");
    expect(profitOf(30000, null, s).status).toBe("nocost");
  });
});

describe("risk analysis", () => {
  it("suggests levels from the provider's words", () => {
    expect(analyzeRisk({ name: "Instagram Followers", desc: "No Refill / Speed: 500-2K/Day", kind: "followers" }).level).toBe("high");
    expect(analyzeRisk({ name: "Instagram Real Likes", desc: "30 Day Refill", kind: "likes" }).level).toBe("low");
    expect(analyzeRisk({ name: "TikTok Video Views", desc: "No Refill / 50-500K/Day", kind: "views" }).level).toBe("med");
    expect(analyzeRisk({ name: "Google Custom Reviews", desc: "Canada" }).level).toBe("blocked");
  });
  it("does not count 'refill' again inside 'no refill'", () => {
    const r = analyzeRisk({ name: "Followers [No Refill]" });
    expect(r.why).toEqual(["+2 no refill"]);
  });
  it("round-trips rules as editable text", () => {
    expect(rulesFromText(rulesToText(DEFAULT_RISK_RULES))).toEqual(DEFAULT_RISK_RULES);
    expect(rulesFromText("−2 real, organic\nnonsense\n+3 bot")).toEqual([{ points: -2, words: ["real", "organic"] }, { points: 3, words: ["bot"] }]);
  });
});

describe("suggested selling price", () => {
  it("leaves the target profit in the worst case, rounded to a clean amount", async () => {
    const { suggestPrice, speedPerDay, profitOf } = await import("@/lib/suppliers/catalog");
    const s = { htgPerUsd: 131.5, paymentFeePct: 3, targetProfitPct: 40, minProfitPct: 15 };
    const p = suggestPrice(1.8, s);
    expect(p % 1000).toBe(0);
    expect(profitOf(p, 1.8, s).pct).toBeGreaterThanOrEqual(40);
    expect(suggestPrice(0.03, s)).toBe(1000); // 3.95 HTG of cost → 10 HTG per 1,000
    expect(suggestPrice(0.001, s)).toBe(500); // never under 5 HTG per 1,000
    expect(speedPerDay("5-10K")).toBe(10_000);
    expect(speedPerDay("1M")).toBe(1_000_000);
    expect(speedPerDay(undefined)).toBe(0);
  });
});
