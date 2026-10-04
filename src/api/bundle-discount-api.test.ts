import { describe, expect, it, vi } from "vitest";
import { createBundleDiscountApi, parseBundleDiscountSnapshot } from "./bundle-discount-api";

const valid = {
  source: "server",
  serverCanonical: true,
  policyVersion: 7,
  tiers: [
    { minItems: 2, rate: 0.04 },
    { minItems: 3, rate: 0.07 },
    { minItems: 4, rate: 0.11 },
  ],
};

describe("bundle discount api", () => {
  it("accepts a monotonic server-owned ladder without hardcoding rates", async () => {
    const request = vi.fn().mockResolvedValue(valid);
    await expect(createBundleDiscountApi({ request } as never).current()).resolves.toEqual({
      source: "server",
      serverCanonical: true,
      policyVersion: 7,
      tiers: [
        { minItems: 2, pct: 0.04 },
        { minItems: 3, pct: 0.07 },
        { minItems: 4, pct: 0.11 },
      ],
    });
    expect(request).toHaveBeenCalledWith({ path: "/api/store/bundle-discount" });
  });

  it.each([
    { ...valid, source: "mock" },
    { ...valid, serverCanonical: false },
    { ...valid, policyVersion: 0 },
    { ...valid, tiers: valid.tiers.slice(0, 2) },
    { ...valid, tiers: [{ minItems: 2, rate: 0.08 }, { minItems: 3, rate: 0.07 }, { minItems: 4, rate: 0.11 }] },
    { ...valid, tiers: [{ minItems: 2, rate: 0.04 }, { minItems: 3, rate: 0.07 }, { minItems: 4, rate: 0.51 }] },
  ])("fails closed for a non-canonical ladder", (input) => {
    expect(() => parseBundleDiscountSnapshot(input)).toThrowError("BUNDLE_DISCOUNT_RESPONSE_INVALID");
  });
});
