import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone, typePhone } from "@/lib/phone";

describe("phone", () => {
  it("reads Haitian numbers written any way", () => {
    for (const s of ["34567890", "3456-7890", "3456 7890", "509 3456 7890", "+509 3456 7890", "+509-34-56-78-90", "0050934567890"]) {
      expect(normalizePhone(s)).toBe("+50934567890");
    }
  });
  it("keeps other countries when written with +", () => {
    expect(normalizePhone("+1 (809) 555-1234")).toBe("+18095551234");
    expect(normalizePhone("+33 6 12 34 56 78")).toBe("+33612345678");
  });
  it("refuses incomplete numbers", () => {
    expect(normalizePhone("3456")).toBeNull();
    expect(normalizePhone("+509 3456 789")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
  it("formats for display", () => {
    expect(formatPhone("+50934567890")).toBe("+509 3456 7890");
    expect(formatPhone("+18095551234")).toBe("+1 809 555 1234");
  });
  it("formats while typing", () => {
    expect(typePhone("3")).toBe("+509 3");
    expect(typePhone("345678")).toBe("+509 3456 78");
    expect(typePhone("34567890123")).toBe("+509 3456 7890");
    expect(typePhone("+509 3456 7890")).toBe("+509 3456 7890");
    expect(typePhone("+50")).toBe("+50");
    expect(typePhone("+1809555")).toBe("+1 809 555");
    expect(typePhone("+509")).toBe("+509");
    // pasted after the prefilled "+509 "
    expect(typePhone("+509 +509 3456 7890")).toBe("+509 3456 7890");
    expect(typePhone("+509 50934567890")).toBe("+509 3456 7890");
    expect(typePhone("+509 +1 809 555 1234")).toBe("+1 809 555 1234");
  });
});
