import { describe, expect, it } from "vitest";
import { decodeBase32, extractTotpSecret, generateTotp } from "@/lib/totp";

describe("TOTP helpers", () => {
  it("decodes Base32", () => {
    // "Hello!" → JBSWY3DPEHPK3PXP is a common demo; "Hello" alone:
    expect(decodeBase32("JBSWY3DPEHPK3PXP")?.toString("ascii")).toContain("Hello");
  });

  it("extracts secrets from account lines and otpauth URLs", () => {
    expect(extractTotpSecret("user:pass:JBSWY3DPEHPK3PXP")).toBe("JBSWY3DPEHPK3PXP");
    expect(extractTotpSecret("otpauth://totp/Acme:user?secret=JBSWY3DPEHPK3PXP&issuer=Acme")).toBe("JBSWY3DPEHPK3PXP");
    expect(extractTotpSecret("user:pass")).toBeNull();
  });

  it("generates a stable 6-digit code for a fixed counter window", () => {
    // RFC 6238 test vector-ish: known secret "12345678901234567890" in Base32 = GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const at = 59 * 1000; // counter 1
    const a = generateTotp(secret, at);
    const b = generateTotp(secret, at);
    expect(a).not.toBeNull();
    expect(a!.code).toMatch(/^\d{6}$/);
    expect(a!.code).toBe(b!.code);
    expect(a!.expiresIn).toBeGreaterThan(0);
    expect(a!.expiresIn).toBeLessThanOrEqual(30);
    // Different window → different code (usually)
    const later = generateTotp(secret, at + 30_000);
    expect(later!.code).not.toBe(a!.code);
  });
});
