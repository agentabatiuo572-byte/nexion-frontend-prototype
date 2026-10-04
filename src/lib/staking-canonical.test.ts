import { describe, expect, it } from "vitest";
import {
  resolveStakingPool,
  canOpenStakingPool,
  canRecommendStakingPool,
  resolvePositionPenalty,
  type StakingConfigState,
} from "./staking-canonical";

const canonicalPool = {
  poolId: 9,
  tierKey: "usdt180d",
  currency: "USDT" as const,
  termDays: 180 as const,
  apy: 0.77,
  penalty: 0.23,
  minAmountUsdt: 37,
  enabled: true,
  killed: false,
  status: "ACTIVE" as const,
};

const remoteState: StakingConfigState = {
  isMockMode: false,
  remoteReady: true,
  pools: [canonicalPool],
};

describe("staking canonical UI config", () => {
  it("denies stopped, killed, missing and unready pools before entering confirmation", () => {
    expect(canOpenStakingPool(remoteState, 180)).toBe(true);
    expect(canOpenStakingPool(remoteState, 30)).toBe(false);
    expect(canOpenStakingPool({ ...remoteState, remoteReady: false }, 180)).toBe(false);
    for (const pool of [{ ...canonicalPool, enabled: false }, { ...canonicalPool, killed: true }]) {
      expect(canOpenStakingPool({ ...remoteState, pools: [pool] }, 180)).toBe(false);
    }
  });

  it("only recommends a pool that is currently buyable for the withdrawal amount", () => {
    const minimumOneHundred = { ...canonicalPool, minAmountUsdt: 100 };

    expect(canRecommendStakingPool({ ...remoteState, pools: [minimumOneHundred] }, 180, 20, minimumOneHundred)).toBe(false);
    expect(canRecommendStakingPool({ ...remoteState, pools: [minimumOneHundred] }, 180, 100, minimumOneHundred)).toBe(true);
    expect(canRecommendStakingPool(
      { ...remoteState, pools: [{ ...minimumOneHundred, enabled: false, status: "STOPPED" as const }] },
      180,
      100,
      minimumOneHundred,
    )).toBe(false);
    expect(canRecommendStakingPool(
      { ...remoteState, pools: [{ ...minimumOneHundred, killed: true, status: "KILLED" as const }] },
      180,
      100,
      minimumOneHundred,
    )).toBe(false);
    expect(canRecommendStakingPool(
      { ...remoteState, remoteReady: false, pools: [minimumOneHundred] },
      180,
      100,
      minimumOneHundred,
    )).toBe(false);
  });
  it("uses the server pool when remote config is ready", () => {
    expect(resolveStakingPool(remoteState, 180, { apy: 1.8, penalty: 0.5, minAmountUsdt: 20 })).toEqual(canonicalPool);
  });

  it("does not fall back to local constants while remote config is unavailable", () => {
    const unavailable: StakingConfigState = { ...remoteState, remoteReady: false, pools: [] };
    expect(resolveStakingPool(unavailable, 180, { apy: 1.8, penalty: 0.5, minAmountUsdt: 20 })).toBeNull();
  });

  it("allows the local table only in mock mode", () => {
    const mock: StakingConfigState = { ...remoteState, isMockMode: true, remoteReady: true, pools: [] };
    const local = { apy: 1.8, penalty: 0.5, minAmountUsdt: 20 };
    expect(resolveStakingPool(mock, 180, local)).toEqual({ termDays: 180, ...local });
  });

  it("requires the position's canonical penalty in remote mode", () => {
    expect(resolvePositionPenalty({ penalty: 0.23 }, false)).toBe(0.23);
    expect(resolvePositionPenalty({}, false)).toBeNull();
    expect(resolvePositionPenalty({ penalty: 0.5 }, true)).toBe(0.5);
  });
});
