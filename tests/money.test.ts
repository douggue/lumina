import { describe, expect, it } from "vitest";
import { formatMoney, htgToUsd, parseAmount } from "@/lib/money";
import { decrypt, encrypt, hmac } from "@/lib/crypto";

describe("money", () => {
  it("parses user input into minor units", () => {
    expect(parseAmount("1,250.50")).toBe(125050);
    expect(parseAmount("100")).toBe(10000);
    expect(parseAmount("1.5")).toBe(150);
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("1.234")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
  it("converts and formats", () => {
    expect(htgToUsd(131_50, 131.5)).toBe(100);
    expect(formatMoney(150000, "HTG", "ht")).toBe("1,500 HTG");
    expect(formatMoney(1250, "HTG", "fr")).toBe("12.50 HTG");
    expect(formatMoney(1050, "USD", "en")).toBe("$10.50");
  });
});

describe("crypto", () => {
  it("round-trips codes and produces stable hashes", () => {
    const enc = encrypt("ABCD-1234");
    expect(enc).not.toContain("ABCD");
    expect(decrypt(enc)).toBe("ABCD-1234");
    expect(hmac(" ABCD-1234 ")).toBe(hmac("ABCD-1234"));
  });
});
