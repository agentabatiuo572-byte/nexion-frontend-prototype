import { describe, expect, it } from "vitest";
import type { Device } from "./types";
import { getLifecycleSummary, hasServerLifecycleProjection } from "./device-lifecycle";

function serverDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: "e3-1",
    rowVersion: 1,
    kind: "stellarbox-s1",
    name: "NexionBox S1",
    gpu: "RTX 4090",
    vramTotal: 96,
    basePower: 1200,
    baseRate: 100,
    baseRateNEX: 50,
    purchasedAt: 1_700_000_000_000,
    activatedAt: 1_700_000_000_000,
    status: "online",
    gpuUsage: 0,
    gpuTemp: 0,
    gpuPower: 0,
    vramUsed: 0,
    currentTask: null,
    recentTasks: [],
    todayEarnings: 0,
    todayEarningsNEX: 0,
    cumulativeEarningsUsdt: 0,
    paidPriceUsdt: 649,
    capacitySource: "server",
    capacityPct: 73.25,
    capacityAgeMonths: 5,
    capacitySubsidized: false,
    capacitySubsidyDays: 30,
    capacitySubsidyRemainingDays: 0,
    capacitySubsidyEndsAt: 1_702_592_000_000,
    serverNow: 1_800_000_000_000,
    ...overrides,
  };
}

describe("E3 server lifecycle projection", () => {
  it("uses server capacity and age even when the client clock is badly skewed", () => {
    const result = getLifecycleSummary(serverDevice(), 9_999_999_999_999);

    expect(result).toMatchObject({
      isDegradable: true,
      monthsOwned: 5,
      efficiency: 0.7325,
      dailyRateAtFull: 100,
      dailyRateNow: 73.25,
    });
    expect(hasServerLifecycleProjection(serverDevice())).toBe(true);
  });

  it("fails closed when a remote projection is null or unavailable instead of using the local curve", () => {
    const nullProjection = serverDevice({ capacityPct: null } as Partial<Device>);
    expect(hasServerLifecycleProjection(nullProjection)).toBe(false);
    expect(getLifecycleSummary(nullProjection, 1_700_000_000_000).efficiency).toBe(0);
    const unavailable = serverDevice({
      capacitySource: "server",
      capacityPct: undefined,
      capacityAgeMonths: undefined,
      capacitySubsidized: undefined,
      capacitySubsidyDays: undefined,
      capacitySubsidyRemainingDays: undefined,
      capacitySubsidyEndsAt: undefined,
    });
    expect(hasServerLifecycleProjection(unavailable)).toBe(false);
    expect(getLifecycleSummary(unavailable, 1_700_000_000_000).efficiency).toBe(0);
  });

  it("keeps explicit mock devices on the local simulation path", () => {
    const result = getLifecycleSummary({
      ...serverDevice(),
      capacitySource: "mock",
      purchasedAt: 1_700_000_000_000,
      capacityPct: 1,
      capacityAgeMonths: 0,
    }, 1_700_000_000_000 + 6 * 30 * 86_400_000);

    expect(result?.monthsOwned).toBeGreaterThan(5);
    expect(result?.efficiency).not.toBe(0.01);
  });

  it("does not leak a previous account's projection when a refreshed device is replaced", () => {
    const previous = serverDevice({ id: "account-a", capacityPct: 91, capacityAgeMonths: 2 });
    const next = serverDevice({ id: "account-b", capacityPct: 44, capacityAgeMonths: 11 });

    expect(getLifecycleSummary(next, 9_999_999_999_999)).toMatchObject({
      monthsOwned: 11,
      efficiency: 0.44,
    });
    expect(getLifecycleSummary(next, 9_999_999_999_999)?.efficiency)
      .not.toBe(getLifecycleSummary(previous, 9_999_999_999_999)?.efficiency);
  });
});
