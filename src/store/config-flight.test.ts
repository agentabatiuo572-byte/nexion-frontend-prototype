import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { platformConfig } = vi.hoisted(() => ({ platformConfig: vi.fn() }));
vi.mock("@/api/runtime", () => ({
  remoteApiEnabled: true,
  apiRuntimeConfig: { environment: "dev", mode: "dev" },
  platformConfigApi: { platformConfig },
}));

import { useConfig } from "./config";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function snapshot() {
  return {
    featureFlags: { computeShareEnabled: true, homeNewcomerTasksEnabled: false, homeWeeklyPromoEnabled: false },
    publicStats: { fleetDevices: 1_000, onlineRatePct: 100, onlineJitter: 0, registeredUsersBase: 0, registeredUsersMonthlyGrowthPct: 0, registeredUsersAnchorAt: 1, realUserCount: 0, virtualUserCount: 0, hashratePercentileTable: [] },
    publicStatsAuthority: { source: "server:nx_config_item,nx_user", sourceEnvironment: "PRODUCTION", runId: "", version: 1 },
    onlineBonus: { h5BaseFactor: 0.6, continuityFullHours: 24 },
    rewards: { enabled: false, effectiveAt: null, welcomeGift: { lockMode: "risk_bucket", usdtAmount: 0, nexAmount: 0 }, inviterReward: { nexAmount: 0 } },
    computeShare: { downloadUrl: "https://downloads.example.test/nexgrid.exe", content: { zhTitle: "", zhGuide: "", enTitle: "", enGuide: "" }, gpuTiers: [] },
    share: { baseUrl: "", channels: [], appDownload: { officialUrl: "", iosUrl: "", androidUrl: "", apkUrl: "", version: "", releaseNotes: { zh: "", en: "" }, source: "unavailable" } },
    updatedAt: "2026-09-09T00:00:00Z", sources: ["server:E6"],
  } as const;
}

describe("platform config flight", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    platformConfig.mockReset();
  });

  it("joins an in-flight load while preserving one queued reload", async () => {
    const first = deferred<ReturnType<typeof snapshot>>();
    const second = deferred<ReturnType<typeof snapshot>>();
    platformConfig.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const config = useConfig();

    let aDone = false;
    let bDone = false;
    const a = config.load().then(() => { aDone = true; });
    const b = config.load().then(() => { bDone = true; });
    await Promise.resolve();
    expect(platformConfig).toHaveBeenCalledTimes(1);
    expect(config.loading).toBe(true);
    first.resolve(snapshot());
    await a;
    await b;
    expect(aDone).toBe(true);
    expect(bDone).toBe(true);
    await Promise.resolve();
    expect(platformConfig).toHaveBeenCalledTimes(2);
    expect(config.loading).toBe(true);
    second.resolve(snapshot());
    await Promise.resolve();
    await Promise.resolve();
    expect(config.loading).toBe(false);
    expect(config.configStatus).toBe("ready");
  });

  it("recovers to a retryable failed state when the adapter throws synchronously", async () => {
    platformConfig.mockImplementation(() => { throw new Error("SYNC_CONFIG_FAILURE"); });
    const config = useConfig();

    await config.load();
    expect(config.loading).toBe(false);
    expect(config.configStatus).toBe("failed");
    expect(config.syncFailed).toBe(true);
  });

  it("drops a previously loaded share policy if the next server refresh fails", async () => {
    platformConfig.mockResolvedValueOnce({
      ...snapshot(),
      share: { ...snapshot().share, baseUrl: "https://nexgrid.ai/ref/" },
    }).mockRejectedValueOnce(new Error("CONFIG_OFFLINE"));
    const config = useConfig();
    await config.load();
    expect(config.config.share.baseUrl).toBe("https://nexgrid.ai/ref/");
    await config.load();
    expect(config.configStatus).toBe("failed");
    expect(config.config.share.baseUrl).toBe("");
    expect(config.config.share.channels).toEqual([]);
  });
});
