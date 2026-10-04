import { describe, expect, it, vi } from "vitest";
import { createRepurchaseApi } from "./repurchase-api";
import { createStakingApi } from "./staking-api";
const stakingSource = {
  source: "nx_staking_product + nx_config_item + nx_emergency_control_setting",
  sourceEnvironment: "PRODUCTION",
  runId: "",
  serverCanonical: true,
};
const repurchaseSource = {
  source: "nx_repurchase_product + nx_config_item + nx_emergency_control_setting",
  sourceEnvironment: "PRODUCTION",
  runId: "",
  serverCanonical: true,
};

function stakingPools() {
  return [30, 90, 180, 365].map((termDays, index) => ({
    poolId: index + 1, tierKey: `usdt${termDays}d`, currency: "USDT", termDays,
    apyPct: 12, penaltyPct: 10, minAmountUsdt: 100, enabled: true, killed: false, status: "ACTIVE",
  }));
}

describe("market backend-canonical provenance", () => {
  it("accepts production facts in development without a run id", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ ...stakingSource, pools: stakingPools() })
      .mockResolvedValueOnce({
        ...stakingSource,
        positions: [],
        positionsPage: { pageNum: 1, pageSize: 50, total: 0, hasMore: false },
        walletBalanceUsdt: 1000,
        serverTime: "2026-08-17T00:00:00Z",
      });
    const api = createStakingApi({ request } as never, "dev");
    await expect(api.fetchStakingPools()).resolves.toHaveLength(4);
    await expect(api.fetchStakingPositions()).resolves.toMatchObject({ sourceEnvironment: "PRODUCTION", runId: "" });
  });

  it("rejects sandbox facts in both development and production", async () => {
    const sandbox = vi.fn().mockResolvedValue({ ...stakingSource, source: "mock", sourceEnvironment: "SANDBOX", runId: "sandbox-run-20260817", pools: stakingPools() });
    await expect(createStakingApi({ request: sandbox } as never, "dev").fetchStakingPools()).rejects.toThrow("STAKING_POOLS_RESPONSE_INVALID");
    await expect(createStakingApi({ request: sandbox } as never, "prod").fetchStakingPools()).rejects.toThrow("STAKING_POOLS_RESPONSE_INVALID");
  });

  it("requires provenance on repurchase config and snapshots", async () => {
    const config = {
      ...repurchaseSource, product: "repurchase", asset: "USDT", apyPct: 35, lockDays: 90,
      nurtureMultiplier: 1.5, h1ReinvestMultiplier: 1, effectiveNurtureMultiplier: 1.5,
      ticketPerOrder: 1, presets: [100, 200], earlyPenaltyPct: 15, minAmountUsdt: 100,
      enabled: true, disclosureRequired: false, currentNexPriceUsdt: 0.12,
      g4LotteryCapacity: 100000, g4TicketsIssuedThisMonth: 0, pointsReward: false,
    };
    const request = vi.fn().mockResolvedValue(config);
    await expect(createRepurchaseApi({ request } as never, "dev").fetchConfig())
      .resolves.toMatchObject({ sourceEnvironment: "PRODUCTION", runId: "" });
    const sandbox = vi.fn().mockResolvedValue({ ...config, source: "mock", sourceEnvironment: "SANDBOX", runId: "sandbox-run-20260817" });
    await expect(createRepurchaseApi({ request: sandbox } as never, "dev").fetchConfig()).rejects.toThrow("REPURCHASE_RESPONSE_INVALID");
  });
});
