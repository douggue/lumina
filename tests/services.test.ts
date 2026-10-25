import { describe, expect, it } from "vitest";
import { checkLink, parseComments, servicePrice, wantsPost } from "@/lib/services";
import { withDiscount } from "@/lib/vip-math";

describe("service links", () => {
  it("accepts the right kind of link and cleans tracking extras", () => {
    expect(checkLink("https://www.tiktok.com/@mika_ht?is_from_webapp=1", "tiktok", false)).toEqual({ ok: true, url: "https://www.tiktok.com/@mika_ht" });
    expect(checkLink("instagram.com/reel/ABC123/?igsh=xyz", "instagram", true)).toEqual({ ok: true, url: "https://instagram.com/reel/ABC123/" });
    expect(checkLink("https://youtu.be/dQw4w9WgXcQ", "youtube", true).ok).toBe(true);
    expect(checkLink("https://vm.tiktok.com/ZMabc123/", "tiktok", true).ok).toBe(true);
    // short links are opened on the server, so they pass here for profiles too
    expect(checkLink("https://vm.tiktok.com/ZMabc123/", "tiktok", false).ok).toBe(true);
  });
  it("refuses a video where a profile is needed, and the reverse", () => {
    expect(checkLink("https://www.tiktok.com/@mika_ht/video/123", "tiktok", false)).toEqual({ ok: false, error: "need_profile" });
    expect(checkLink("https://www.instagram.com/mika", "instagram", true)).toEqual({ ok: false, error: "need_post" });
  });
  it("refuses another platform or text that is not a link", () => {
    expect(checkLink("https://www.instagram.com/mika", "tiktok", false)).toEqual({ ok: false, error: "not_platform" });
    expect(checkLink("bonjou.html", "tiktok", false)).toEqual({ ok: false, error: "not_platform" });
  });
  it("live viewers take a profile or a live link", () => {
    expect(wantsPost("live", "live")).toBe(false);
    expect(checkLink("https://www.tiktok.com/@mika_ht/live", "tiktok", false).ok).toBe(true);
  });
});

describe("service prices", () => {
  it("prices per 1,000, live by duration, never below 1 gourde", () => {
    expect(servicePrice(42000, 1000, "default")).toBe(42000);
    expect(servicePrice(42000, 500, "default")).toBe(21000);
    expect(servicePrice(90000, 100, "live", 60)).toBe(18000);
    expect(servicePrice(800, 1, "default")).toBe(100);
  });
  it("applies the VIP discount", () => {
    expect(withDiscount(42000, 0)).toBe(42000);
    expect(withDiscount(42000, 5)).toBe(39900);
  });
  it("one comment per line, without blanks or repeats", () => {
    expect(parseComments("Bèl!\n\n  Bravo \nbèl!\nKontinye konsa, frè m")).toEqual(["Bèl!", "Bravo", "Kontinye konsa, frè m"]);
  });
});

describe("smarter link check", () => {
  it("turns a username into the profile link", () => {
    expect(checkLink("@mika_ht", "tiktok", false)).toEqual({ ok: true, url: "https://www.tiktok.com/@mika_ht" });
    expect(checkLink("mika.ht", "instagram", false).ok).toBe(false); // looks like an address, not a username
    expect(checkLink("@mika.ht", "instagram", false)).toEqual({ ok: true, url: "https://www.instagram.com/mika.ht" });
    expect(checkLink("@mika", "tiktok", true)).toEqual({ ok: false, error: "need_post" });
  });
  it("enforces reels, Shorts or normal videos when the service asks", () => {
    expect(checkLink("https://www.instagram.com/p/ABC/", "instagram", true, "reel")).toEqual({ ok: false, error: "need_reel" });
    expect(checkLink("https://www.instagram.com/reel/ABC/", "instagram", true, "reel").ok).toBe(true);
    expect(checkLink("https://www.youtube.com/watch?v=x", "youtube", true, "shorts")).toEqual({ ok: false, error: "need_shorts" });
    expect(checkLink("https://www.youtube.com/shorts/abc", "youtube", true, "video")).toEqual({ ok: false, error: "need_video" });
    expect(checkLink("https://youtu.be/abc", "youtube", true, "video").ok).toBe(true);
  });
});
