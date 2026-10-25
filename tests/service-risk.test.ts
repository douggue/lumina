import { describe, expect, it } from "vitest";
import { analyzeRisk, DEFAULT_BLOCKED } from "@/lib/service-risk";

describe("analyzeRisk account/sms unblock", () => {
  it("still blocks account-sale wording on SMM kinds", () => {
    expect(analyzeRisk({ name: "Cheap Instagram account sale", kind: "followers" }).level).toBe("blocked");
    expect(analyzeRisk({ name: "Accounts for sale bulk", kind: "likes" }).level).toBe("blocked");
  });

  it("allows account-sale wording for YTSeller account/sms kinds", () => {
    expect(analyzeRisk({ name: "Gmail Accounts for sale Instant", kind: "account" }).level).not.toBe("blocked");
    expect(analyzeRisk({ name: "SMS account sale number US", kind: "sms", desc: "kind:sms" }).level).not.toBe("blocked");
  });

  it("still blocks fake-review phrases even for account kind", () => {
    expect(analyzeRisk({ name: "Google Custom Reviews pack", kind: "account" }).level).toBe("blocked");
  });

  it("keeps DEFAULT_BLOCKED list including account sale for admin defaults", () => {
    expect(DEFAULT_BLOCKED).toEqual(expect.arrayContaining(["account sale", "accounts for sale"]));
  });
});
