import { describe, expect, it } from "vitest";
import { contactEmail } from "../../supabase/functions/_shared/contactEmail";

describe("optional real contact email", () => {
  it("removes the existing singular placeholder domain", () => {
    expect(contactEmail("7875550100@placeholder.local")).toBeNull();
  });
  it("removes the plural placeholder domain requested by Charlie", () => {
    expect(contactEmail("7875550100@placeholders.local")).toBeNull();
  });
  it("prevents a sync returning uppercase and surrounding spaces from restoring placeholders", () => {
    expect(contactEmail("  7875550100@PLACEHOLDER.LOCAL  ")).toBeNull();
    expect(contactEmail("  7875550100@PLACEHOLDERS.LOCAL  ")).toBeNull();
  });
  it("keeps missing email absent rather than fabricating an address", () => {
    expect(contactEmail(null)).toBeNull();
    expect(contactEmail(undefined)).toBeNull();
    expect(contactEmail(7875550100)).toBeNull();
    expect(contactEmail("   ")).toBeNull();
  });
  it("preserves a real email, including its original letter case", () => {
    expect(contactEmail("  Carlos@example.com  ")).toBe("Carlos@example.com");
  });
  it("does not suppress a different domain containing similar words", () => {
    expect(contactEmail("placeholder.local@example.com")).toBe("placeholder.local@example.com");
    expect(contactEmail("client@placeholder.local.example.com")).toBe("client@placeholder.local.example.com");
  });
  it("stays absent through repeated inbound normalization", () => {
    expect(contactEmail(contactEmail("client@placeholders.local"))).toBeNull();
  });
});