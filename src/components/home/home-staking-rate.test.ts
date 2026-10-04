import { describe, expect, it } from "vitest";

import { highestLiveStakingApyPct } from "./home-staking-rate";

describe("highestLiveStakingApyPct", () => {
  it("uses the highest enabled PC-managed staking pool", () => {
    expect(highestLiveStakingApyPct([
      { apy: 0.12, enabled: true, killed: false },
      { apy: 1.8, enabled: true, killed: false },
      { apy: 2.5, enabled: false, killed: false },
    ])).toBe(180);
  });

  it("excludes killed pools and returns null when no product can be sold", () => {
    expect(highestLiveStakingApyPct([
      { apy: 1.8, enabled: true, killed: true },
      { apy: 0.8, enabled: false, killed: false },
    ])).toBeNull();
  });
});
