import { afterEach, describe, expect, it } from "vitest";
import { emailEnabled, emailFrom, explainResendError, resendKey } from "@/lib/email";

const saved = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };
afterEach(() => {
  process.env.RESEND_API_KEY = saved.key;
  process.env.EMAIL_FROM = saved.from;
});

describe("email settings pasted from a phone", () => {
  it("removes spaces, line breaks, quotes and invisible characters", () => {
    process.env.RESEND_API_KEY = ' "re_abc123def456ghi789jkl012mno"\n';
    process.env.EMAIL_FROM = "​HaitiViral <noreply@haitiviral.com> ";
    expect(resendKey()).toBe("re_abc123def456ghi789jkl012mno");
    expect(emailFrom()).toBe("HaitiViral <noreply@haitiviral.com>");
    expect(emailEnabled()).toBe(true);
  });

  it("is off when a value is only whitespace", () => {
    process.env.RESEND_API_KEY = "  ";
    process.env.EMAIL_FROM = "HaitiViral <noreply@haitiviral.com>";
    expect(emailEnabled()).toBe(false);
  });
});

describe("Resend errors in plain words", () => {
  it("explains the common refusals", () => {
    expect(explainResendError(400, '{"message":"API key is invalid"}')).toMatch(/API key is wrong/);
    expect(explainResendError(403, '{"message":"You can only send testing emails to your own email address"}')).toMatch(/domain is not verified/i);
    expect(explainResendError(403, '{"message":"The haitiviral.com domain is not verified"}')).toMatch(/not verified/);
    expect(explainResendError(422, '{"message":"Invalid `from` field"}')).toMatch(/EMAIL_FROM/);
  });
});
