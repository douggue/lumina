import { describe, expect, it } from "vitest";
import { maxVideosFor, packPrice, splitEvenly, tiktokHandle } from "@/lib/pack-math";

describe("starter packs", () => {
  it("prices the pack from its contents minus the discount", () => {
    // 500 followers at 320 HTG/1K, 1,000 likes at 40, 5,000 views at 8 = 160 + 40 + 40 = 240 HTG
    const r = packPrice([{ quantity: 500, rate: 32000 }, { quantity: 1000, rate: 4000 }, { quantity: 5000, rate: 800 }], 10);
    expect(r).toEqual({ separate: 24000, price: 21600 });
  });
  it("spreads evenly, remainder first", () => {
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEvenly(10, 1)).toEqual([10]);
  });
  it("caps the number of videos by the provider minimums and the admin cap", () => {
    const lines = [{ quantity: 500, rate: 1, post: false, meta: { min: 100 } }, { quantity: 1000, rate: 1, post: true, meta: { min: 50 } }, { quantity: 2000, rate: 1, post: true, meta: { min: 500 } }];
    expect(maxVideosFor(lines, 10)).toBe(4);
    expect(maxVideosFor(lines, 3)).toBe(3);
    expect(maxVideosFor([lines[0]], 10)).toBe(0);
  });
  it("reads the TikTok account from links", () => {
    expect(tiktokHandle("https://www.tiktok.com/@Mika_HT/video/1")).toBe("mika_ht");
    expect(tiktokHandle("https://www.instagram.com/reel/x")).toBeNull();
  });
});
