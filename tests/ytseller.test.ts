import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
import { mapYtProduct, parseYtResult, ytOutcome } from "@/lib/suppliers/ytseller";
import { socialAccountKey, socialAccountFromUrl } from "@/lib/social-account";
import { isDisposableEmail, scoreTrialRisk, DEFAULT_TRIAL_THRESHOLDS } from "@/lib/trial-risk";

describe("YTSeller status mapping", () => {
  it("maps provider words", () => {
    expect(ytOutcome("Completed")).toBe("done");
    expect(ytOutcome("Delivered")).toBe("done");
    expect(ytOutcome("Pending")).toBe("running");
    expect(ytOutcome("Canceled")).toBe("canceled");
    expect(ytOutcome("Weird")).toBe("unknown");
  });
});

describe("YTSeller product mapping", () => {
  it("reads id/price/stock/require and guesses SMS vs account", () => {
    const a = mapYtProduct({ id: "12", name: "Gmail Account", category: "Email", price: "0.27", stock: 50, delivery: "Instant", require: "email" });
    expect(a).toMatchObject({ id: "12", price: 0.27, stock: 50, kind: "account", require: ["email"], delivery: "Instant" });
    const s = mapYtProduct({ product_id: "99", name: "US SMS Gmail", category: "SMS", rate: 0.44, quantity: 3 });
    expect(s).toMatchObject({ id: "99", price: 0.44, stock: 3, kind: "sms" });
    expect(mapYtProduct({})).toBeNull();
  });
});

describe("YTSeller result_product parsing", () => {
  it("splits lines and object shapes", () => {
    expect(parseYtResult("a:b\nc:d")).toEqual(["a:b", "c:d"]);
    expect(parseYtResult({ result: "user:pass" })).toEqual(["user:pass"]);
    expect(parseYtResult({ results: [{ username: "u", password: "p" }] })).toEqual(["u:p"]);
    expect(parseYtResult({ codes: ["x:y"] })).toEqual(["x:y"]);
  });
});

describe("social account key", () => {
  it("keys TikTok / IG / YouTube accounts after clean URLs", () => {
    expect(socialAccountKey("https://www.tiktok.com/@Mika/video/123", "tiktok")).toBe("tiktok:@mika");
    expect(socialAccountKey("https://www.instagram.com/Cool.User/", "instagram")).toBe("instagram:@cool.user");
    expect(socialAccountKey("https://www.youtube.com/@LuminaHT", "youtube")).toBe("youtube:@luminaht");
    expect(socialAccountKey("https://www.youtube.com/watch?v=abc123", "youtube")).toBe("youtube:video:abc123");
    expect(socialAccountFromUrl("not a url")).toBeNull();
  });
});

describe("trial risk score", () => {
  const base = {
    phoneVerified: true,
    hasDeviceId: true,
    deviceReuse: false,
    networkSignal: "ok" as const,
    disposableEmail: false,
    accountAgeDays: 10,
    turnstileFailed: false,
    noDeposit: false,
    emailVerified: true,
  };
  it("scores low for a clean request", () => {
    const r = scoreTrialRisk(base, { ...DEFAULT_TRIAL_THRESHOLDS, autoApprove: true });
    expect(r.score).toBe(0);
    expect(r.band).toBe("auto");
  });
  it("refuses high-risk combinations", () => {
    const r = scoreTrialRisk({ ...base, phoneVerified: false, networkSignal: "vpn", disposableEmail: true, turnstileFailed: true });
    expect(r.score).toBeGreaterThanOrEqual(DEFAULT_TRIAL_THRESHOLDS.refuseMin);
    expect(r.band).toBe("refuse");
  });
  it("keeps medium in review when auto-approve is off", () => {
    const r = scoreTrialRisk(base, { ...DEFAULT_TRIAL_THRESHOLDS, autoApprove: false });
    expect(r.band).toBe("review");
  });
  it("flags disposable domains", () => {
    expect(isDisposableEmail("a@mailinator.com")).toBe(true);
    expect(isDisposableEmail("a@gmail.com")).toBe(false);
  });
});
