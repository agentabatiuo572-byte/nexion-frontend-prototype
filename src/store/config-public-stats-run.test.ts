import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FLEET_DEVICES } from "@/lib/platform-stats";

const { platformConfig } = vi.hoisted(() => ({
  platformConfig: vi.fn(),
}));

vi.mock("@/api/runtime", () => ({
  remoteApiEnabled: true,
  apiRuntimeConfig: { environment: "dev", mode: "dev" },
  platformConfigApi: { platformConfig },
}));

import { useConfig } from "./config";

function snapshot(fleetDevices = FLEET_DEVICES, referralRewardsEnabled = false) {
  return {
    featureFlags: {
      computeShareEnabled: true,
      homeNewcomerTasksEnabled: true,
      homeWeeklyPromoEnabled: true,
    },
    publicStats: {
      fleetDevices,
      onlineRatePct: 100,
      onlineJitter: 20,
      registeredUsersBase: 1_420_000,
      registeredUsersMonthlyGrowthPct: 2.9,
      registeredUsersAnchorAt: 1_786_097_730_000,
      realUserCount: 4_321,
      virtualUserCount: 12_000,
      hashratePercentileTable: [{ tops: 10, cumPct: 40 }, { tops: 20, cumPct: 100 }],
    },
    publicStatsAuthority: {
      source: "server:nx_config_item,nx_user",
      sourceEnvironment: "PRODUCTION",
      runId: "",
      version: 3,
    },
    onlineBonus: { h5BaseFactor: 0.6, continuityFullHours: 24 },
    rewards: {
      enabled: referralRewardsEnabled,
      effectiveAt: referralRewardsEnabled ? "2026-09-01T00:00:00Z" : null,
      welcomeGift: { lockMode: "risk_bucket", usdtAmount: referralRewardsEnabled ? 5 : 0, nexAmount: referralRewardsEnabled ? 20 : 0 },
      inviterReward: { nexAmount: referralRewardsEnabled ? 200 : 0 },
    },
    computeShare: { downloadUrl: "", content: { zhTitle: "", zhGuide: "", enTitle: "", enGuide: "" }, gpuTiers: [] },
    share: {
      baseUrl: "https://nexgrid.ai/ref/",
      channels: [],
      appDownload: { officialUrl: "", iosUrl: "", androidUrl: "", apkUrl: "", version: "", releaseNotes: { zh: "", en: "" }, source: "unavailable" },
    },
    updatedAt: "2026-08-19T00:00:00Z",
    sources: ["server:H9"],
  } as const;
}

describe("H9 public stats canonical authority", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    platformConfig.mockReset();
  });

  it("loads the PC-managed production projection in development", async () => {
    platformConfig.mockResolvedValue(snapshot());
    const config = useConfig();

    await config.load();
    expect(config.syncFailed).toBe(false);
    expect(config.config.publicStats.fleetDevices).toBe(FLEET_DEVICES);
    expect(config.publicStatsAuthority).toMatchObject({ sourceEnvironment: "PRODUCTION", runId: "" });
  });

  it("installs the newest canonical snapshot on an explicit reload", async () => {
    platformConfig.mockResolvedValueOnce(snapshot());
    const config = useConfig();
    await config.load();
    expect(config.config.publicStats.fleetDevices).toBe(FLEET_DEVICES);

    platformConfig.mockResolvedValueOnce(snapshot(31_000));
    await config.load();
    expect(config.config.publicStats.fleetDevices).toBe(31_000);
  });

  it("rejects a sandbox projection in development", async () => {
    platformConfig.mockResolvedValue({
      ...snapshot(),
      publicStatsAuthority: {
        source: "mock",
        sourceEnvironment: "SANDBOX",
        runId: "home-public-stats-20260819",
        version: 3,
      },
    });
    const config = useConfig();

    await config.load();

    expect(config.syncFailed).toBe(true);
    expect(config.publicStatsAuthority).toBeNull();
    expect(config.config.publicStats.fleetDevices).toBe(0);
  });

  it("clears a previously enabled referral reward projection when the remote authority fails", async () => {
    platformConfig.mockResolvedValueOnce(snapshot(FLEET_DEVICES, true));
    const config = useConfig();
    await config.load();
    expect(config.config.rewards.enabled).toBe(true);

    platformConfig.mockRejectedValueOnce(new Error("backend unavailable"));
    await config.load();

    expect(config.syncFailed).toBe(true);
    expect(config.config.rewards).toEqual({
      enabled: false,
      effectiveAt: null,
      welcomeGift: { lockMode: "risk_bucket", usdtAmount: 0, nexAmount: 0 },
      inviterReward: { nexAmount: 0 },
    });
  });
});
