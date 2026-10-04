import { describe, expect, it, vi } from "vitest";
import { createPlatformConfigApi, parsePlatformComputeConfig, parsePlatformExperienceConfig } from "./platform-config-api";

const valid = {
  featureFlags: {
    homeNewcomerTasksEnabled: true,
    homeWeeklyPromoEnabled: false,
  },
  share: {
    baseUrl: "https://nexgrid.ai/ref/",
    channels: [{
      key: "zalo",
      intentType: "scheme",
      textTemplate: "Join {link}",
      enabled: true,
    }],
    appDownload: {
      officialUrl: "https://download.nexgrid.ai/app/NexGrid-1.2.3.apk",
      iosUrl: "",
      androidUrl: "",
      apkUrl: "",
      version: "1.2.3",
      releaseNotes: { zh: "Stability fixture", en: "Stability fixes" },
      source: "official",
    },
  },
};

const validPlatform = {
  ...valid,
  featureFlags: {
    ...valid.featureFlags,
    computeShareEnabled: true,
  },
  publicStats: {
    version: 1,
    serverCanonical: true,
    source: "server:nx_config_item,nx_user",
    sourceEnvironment: "PRODUCTION",
    runId: "",
    realUserCount: 2_000,
    values: {
      fleetDevices: 20_000,
      onlineRatePct: 90,
      onlineJitter: 20,
      registeredUsersBase: 10_000,
      registeredUsersMonthlyGrowthPct: 2,
      registeredUsersAnchorAt: 1_756_684_800_000,
      virtualUserCount: 8_000,
      hashratePercentileTable: [{ tops: 0, cumPct: 0 }, { tops: 100, cumPct: 100 }],
    },
  },
  onlineBonus: { h5BaseFactor: 0.6, continuityFullHours: 24 },
  computerCompute: {
    domain: "E6",
    flags: [{ key: "computeShareEnabled", enabled: true }],
    coefficients: [
      { key: "h5BaseFactor", value: 0.6 },
      { key: "continuityFullHours", value: 24 },
    ],
    yieldEstimate: [
      { key: "topsBaseline", value: 100 },
      { key: "dailyUsdtPerBaseline", value: 0.24 },
      { key: "nexPerUsdt", value: 10 },
    ],
    gpuTiers: ["G1", "G2", "G3", "G4", "G5", "G6"].map((id, index) => ({
      id,
      label: `Tier ${id}`,
      tops: (index + 1) * 100,
      keywords: [{ slot: "keyword1", value: `kw-${id}` }],
    })),
    download: {
      url: "",
      zhTitle: "",
      zhGuide: "",
      enTitle: "",
      enGuide: "",
    },
    sources: ["e6.compute_config"],
  },
  updatedAt: "2026-09-01T00:00:00Z",
};

describe("platform experience config contract", () => {
  it("accepts the retired zero H5 factor while keeping other coefficients strict", () => {
    const retired = {
      ...validPlatform,
      onlineBonus: { h5BaseFactor: 0, continuityFullHours: 24 },
      computerCompute: {
        ...validPlatform.computerCompute,
        coefficients: [
          { key: "h5BaseFactor", value: "0" },
          { key: "continuityFullHours", value: 24 },
        ],
      },
    };
    expect(parsePlatformComputeConfig(retired).share.baseUrl).toBe("https://nexgrid.ai/ref/");
    for (const value of ["-0.1", "0.1"]) {
      expect(() => parsePlatformComputeConfig({
        ...retired,
        computerCompute: {
          ...retired.computerCompute,
          coefficients: [{ key: "h5BaseFactor", value }, retired.computerCompute.coefficients[1]],
        },
      })).toThrow("E6_PLATFORM_CONFIG_RESPONSE_INVALID");
    }
    expect(() => parsePlatformComputeConfig({
      ...retired,
      onlineBonus: { h5BaseFactor: -0.1, continuityFullHours: 24 },
    })).toThrow("E6_PLATFORM_CONFIG_RESPONSE_INVALID");
    expect(() => parsePlatformComputeConfig({
      ...retired,
      onlineBonus: { h5BaseFactor: 0, continuityFullHours: 0 },
    })).toThrow("E6_PLATFORM_CONFIG_RESPONSE_INVALID");
  });

  it("parses share URL templates when App Plus lacks String.replaceAll", () => {
    const descriptor = Object.getOwnPropertyDescriptor(String.prototype, "replaceAll");
    Object.defineProperty(String.prototype, "replaceAll", { configurable: true, value: undefined });
    let parsedBase = "";
    try {
      parsedBase = parsePlatformComputeConfig({
        ...validPlatform,
        share: {
          ...valid.share,
          channels: [
            { key: "telegram", intentType: "web", textTemplate: "Join {link}", urlTemplate: "https://t.me/share/url?url={link}&text={text}", enabled: true },
            { key: "sms", intentType: "web", textTemplate: "Join {link}", urlTemplate: "sms:?body={text}", enabled: true },
          ],
        },
      }).share.baseUrl;
    } finally {
      if (descriptor) Object.defineProperty(String.prototype, "replaceAll", descriptor);
      else Reflect.deleteProperty(String.prototype, "replaceAll");
    }
    expect(parsedBase).toBe("https://nexgrid.ai/ref/");
  });

  it("parses the server share base and channels in App Plus without browser URL", () => {
    vi.stubGlobal("URL", undefined);
    try {
      const platform = {
        ...validPlatform,
        share: {
          ...valid.share,
          channels: [
            { key: "telegram", intentType: "web", textTemplate: "Join {link}", urlTemplate: "https://t.me/share/url?url={link}&text={text}", enabled: true },
            { key: "sms", intentType: "web", textTemplate: "Join {link}", urlTemplate: "sms:?body={text}", enabled: true },
            { key: "copy", intentType: "copy", enabled: true },
          ],
        },
      };
      expect(parsePlatformComputeConfig(platform).share).toMatchObject({ baseUrl: "https://nexgrid.ai/ref/" });
      expect(parsePlatformExperienceConfig({ ...valid, share: { ...valid.share, baseUrl: "https://[2001:db8::1]/ref/" } }).share.baseUrl)
        .toBe("https://[2001:db8::1]/ref/");
      expect(parsePlatformExperienceConfig({ ...valid, share: { ...valid.share, channels: [{
        key: "sms", intentType: "web", textTemplate: "Join {link}", urlTemplate: "SMS:?body={text}", enabled: true,
      }] } }).share.channels[0].urlTemplate).toBe("SMS:?body={text}");
      for (const baseUrl of ["http://nexgrid.ai/ref/", "https://user@evil.example/ref/", "https://evil..example/ref/", "https://evil.example:70000/ref/"]) {
        expect(() => parsePlatformExperienceConfig({
          ...valid,
          share: { ...valid.share, baseUrl },
        })).toThrow("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
      }
      expect(() => parsePlatformExperienceConfig({
        ...valid,
        share: { ...valid.share, channels: [{
          key: "telegram", intentType: "web", textTemplate: "Join {link}", urlTemplate: "https://user@evil.example/?text={text}", enabled: true,
        }] },
      })).toThrow("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("parses server-owned flags, share channels, and official release metadata", () => {
    expect(parsePlatformExperienceConfig(valid)).toMatchObject(valid);
  });

  it("rejects unsafe URLs, unknown enums, and empty official release metadata", () => {
    expect(() => parsePlatformExperienceConfig({
      ...valid,
      share: {
        ...valid.share,
        channels: [{ ...valid.share.channels[0], key: "unknown" }],
        appDownload: { ...valid.share.appDownload, officialUrl: "javascript:alert(1)" },
      },
    })).toThrow("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
    for (const urlTemplate of ["javascript:{text}", "data:text/html,{text}", "file:///{link}"]) {
      expect(() => parsePlatformExperienceConfig({
        ...valid,
        share: {
          ...valid.share,
          channels: [{
            key: "telegram",
            intentType: "web",
            textTemplate: "Join {link}",
            urlTemplate,
            enabled: true,
          }],
        },
      })).toThrow("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
    }
    expect(parsePlatformExperienceConfig({
      ...valid,
      share: {
        ...valid.share,
        channels: [{
          key: "sms",
          intentType: "web",
          textTemplate: "Join {link}",
          urlTemplate: "sms:?body={text}",
          enabled: true,
        }],
      },
    }).share.channels[0].urlTemplate).toBe("sms:?body={text}");
    expect(() => parsePlatformExperienceConfig({
      ...valid,
      share: {
        ...valid.share,
        appDownload: { ...valid.share.appDownload, version: "", releaseNotes: { zh: "", en: "" } },
      },
    })).toThrow("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
  });

  it("rejects sandbox mock source instead of treating a text URL as an installer", () => {
    expect(() => parsePlatformExperienceConfig({
      ...valid,
      share: {
        ...valid.share,
        appDownload: {
          ...valid.share.appDownload,
          officialUrl: "http://localhost:8110/mock/app.apk",
          source: "mock",
        },
      },
    })).toThrow("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
    expect(() => parsePlatformExperienceConfig({
      ...valid,
      share: {
        ...valid.share,
        appDownload: {
          ...valid.share.appDownload,
          source: "unavailable",
          officialUrl: "not-an-apk",
          version: "",
          releaseNotes: { zh: "", en: "" },
        },
      },
    })).toThrow("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
  });
});

describe("referral reward public effective boundary", () => {
  it("keeps the server effectiveAt together with the reward values", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        ...validPlatform,
      })
      .mockResolvedValueOnce({ enabled: true, welcomeGift: { lockMode: "direct", usdtAmount: 1, nexAmount: 2 }, inviterReward: { nexAmount: 3 }, rhythmMonth: 1, newcomerMultiplier: 1, inviterMultiplier: 1, effectiveAt: "2026-09-01T00:00:00Z", sources: ["nx_user.sponsor_user_id"] });
    await expect(createPlatformConfigApi({ request } as never).platformConfig()).resolves.toMatchObject({
      rewards: { effectiveAt: "2026-09-01T00:00:00Z" },
    });
  });
});
