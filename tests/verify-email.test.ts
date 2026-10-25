import { describe, expect, it } from "vitest";
import { verificationRequired } from "@/lib/verify-email";

const customer = { role: "CUSTOMER", emailVerified: false };

describe("email confirmation lock", () => {
  it("locks an unconfirmed customer when the switch is on and email works", () => {
    expect(verificationRequired(true, true, customer)).toBe(true);
  });
  it("never locks when email sending is off (nobody gets stuck)", () => {
    expect(verificationRequired(true, false, customer)).toBe(false);
  });
  it("respects the admin switch", () => {
    expect(verificationRequired(false, true, customer)).toBe(false);
  });
  it("does not lock confirmed customers or staff", () => {
    expect(verificationRequired(true, true, { ...customer, emailVerified: true })).toBe(false);
    expect(verificationRequired(true, true, { role: "SUPER_ADMIN", emailVerified: false })).toBe(false);
  });
});
