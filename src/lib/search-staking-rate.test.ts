import { describe, expect, it } from "vitest";

import { searchStakingRateSummary } from "./search-staking-rate";

describe("search staking rate summary", () => {
  it("uses the highest enabled G1 pool instead of a fixed promotional rate", () => {
    expect(searchStakingRateSummary({
      remoteReady: true,
      pools: [
        { apy: 0.8, enabled: true, killed: false },
        { apy: 1.25, enabled: true, killed: false },
        { apy: 1.8, enabled: false, killed: false },
      ],
      fallback: "View current lock terms and rates",
      formatApy: (apy) => `${apy}% APY`,
    })).toBe("125% APY");
  });

  it("does not fall back to a stale promotional rate when G1 is unavailable", () => {
    expect(searchStakingRateSummary({
      remoteReady: false,
      pools: [],
      fallback: "View current lock terms and rates",
      formatApy: (apy) => `${apy}% APY`,
    })).toBe("View current lock terms and rates");
  });
});
