import { afterEach, describe, expect, it, vi } from "vitest";
import { onSiteDomain, ownDomain, siteUrl } from "@/lib/site-url";

afterEach(() => vi.unstubAllEnvs());

describe("site address", () => {
  it("before the own domain is connected, the live site keeps its vercel.app address", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "haitiviral.vercel.app");
    expect(ownDomain()).toBeNull();
    expect(siteUrl()).toBe("https://haitiviral.vercel.app");
  });
  it("an explicit own domain wins", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.haitiviral.com/");
    expect(ownDomain()).toBe("https://www.haitiviral.com");
    expect(siteUrl()).toBe("https://www.haitiviral.com");
  });
  it("email links are moved to the site's domain, callback included", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.haitiviral.com");
    const link = onSiteDomain("https://haitiviral.vercel.app/api/auth/verify-email?token=abc&callbackURL=https%3A%2F%2Fhaitiviral.vercel.app%2Fht%2Fcheckout");
    expect(link).toBe("https://www.haitiviral.com/api/auth/verify-email?token=abc&callbackURL=https%3A%2F%2Fwww.haitiviral.com%2Fht%2Fcheckout");
    expect(onSiteDomain("https://haitiviral.vercel.app/api/auth/verify-email?token=abc&callbackURL=%2Fht%2Fcheckout")).toBe(
      "https://www.haitiviral.com/api/auth/verify-email?token=abc&callbackURL=%2Fht%2Fcheckout",
    );
  });
});
