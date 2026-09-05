import { describe, expect, it, vi } from "vitest";
import { createGenesisApi, parseGenesisPublicState } from "./genesis-api";

describe("genesis remote truth contract", () => {
  it("reads eligibility from the dedicated server endpoint", async () => {
    const request = vi.fn().mockResolvedValue({
      serverCanonical: true,
      eligible: false,
      reasons: ["ACCOUNT_AGE_REQUIRED"],
      ownedCount: 0,
      maxPerUser: 2,
      remainingCap: 2,
      minAccountAgeDays: 30,
      accountAgeDays: 1,
      halted: false,
    });
    const api = createGenesisApi({ request } as never);

    await expect(api.eligibility()).resolves.toMatchObject({
      eligible: false,
      maxPerUser: 2,
      reasons: ["ACCOUNT_AGE_REQUIRED"],
    });
    expect(request).toHaveBeenCalledWith({ method: "GET", path: "/api/genesis/eligibility" });
  });

  it("keeps unavailable market metrics null and accepts a negative server floor delta", () => {
    const state = parseGenesisPublicState({
      serverCanonical: true,
      series: {
        seriesCode: "genesis-main", name: "Genesis", totalSupply: 1000,
        soldSupply: 0, remainingSupply: 1000, priceUsdt: 9999,
        royaltyPct: 2.5, dailyEmissionRatePct: 0,
      },
      market: { enabled: true },
      emission: { open: false },
      sale: {
        serverCanonical: true, available: true, eligibilityEnabled: true,
        maxPerUser: 5, minAccountAgeDays: 0, presaleEnabled: false,
        showCountdown: false, unitPriceUsdt: 9999, open: true,
      },
      listings: [], transactions: [], tiers: [{ id: "tier-1", from: 0, to: 1000, priceUSDT: 9999 }],
      tiersVersion: 1, marketOpenState: "open", marketOpenStateVersion: 1,
      closedNoticeKey: "default", catalogAvailable: true, tradeAvailable: true,
      tradeBlockedReason: "NONE", marketStats: {
        floorUsdt: null, volume24hUsdt: null, owners: null,
        floorDeltaPct: -12.5, lastSaleUsdt: null,
      },
    });

    expect(state.marketStats).toEqual({
      floorUsdt: null, volume24hUsdt: null, owners: null,
      floorDeltaPct: -12.5, lastSaleUsdt: null,
    });
  });
});
