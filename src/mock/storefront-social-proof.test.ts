import { describe, expect, it } from "vitest";
import { fixtureSocialProofValue, MOCK_STOREFRONT_SOCIAL_PROOF_FIXTURE_ID } from "./storefront-social-proof";

describe("storefront social-proof sandbox fixture", () => {
  it("is named and deterministic rather than random telemetry", () => {
    expect(MOCK_STOREFRONT_SOCIAL_PROOF_FIXTURE_ID).toBe("storefront-social-proof-fixture-v1");
    const first = Array.from({ length: 12 }, (_, tick) => fixtureSocialProofValue(50, tick, 9, 1));
    const second = Array.from({ length: 12 }, (_, tick) => fixtureSocialProofValue(50, tick, 9, 1));
    expect(first).toEqual(second);
    expect(first.every((value) => value >= 46 && value <= 54)).toBe(true);
  });
});
