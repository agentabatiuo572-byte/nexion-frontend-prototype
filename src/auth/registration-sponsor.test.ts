import { describe, expect, it } from "vitest";
import { normalizeRegistrationSponsorCode } from "./registration-sponsor";

describe("registration sponsor authority", () => {
  it("accepts and canonicalizes the real backend referral-code format", () => {
    expect(normalizeRegistrationSponsorCode(" nx-7ec754-d46b6e ", true))
      .toBe("NX7EC754D46B6E");
  });

  it("keeps the mock-only NEXGRID format when the remote API is disabled", () => {
    expect(normalizeRegistrationSponsorCode("nexgrid-ab12", false))
      .toBe("NEXGRID-AB12");
    expect(normalizeRegistrationSponsorCode("NX7EC754D46B6E", false)).toBeNull();
  });

  it("rejects malformed remote values instead of sending ambiguous input", () => {
    expect(normalizeRegistrationSponsorCode("--", true)).toBeNull();
    expect(normalizeRegistrationSponsorCode("NX/INVALID", true)).toBeNull();
  });
});
