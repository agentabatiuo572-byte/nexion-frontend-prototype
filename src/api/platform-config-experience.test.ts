import { describe, expect, it } from "vitest";
import { parsePlatformExperienceConfig } from "./platform-config-api";

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

describe("platform experience config contract", () => {
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
    expect(() => parsePlatformExperienceConfig({
      ...valid,
      share: {
        ...valid.share,
        appDownload: { ...valid.share.appDownload, version: "", releaseNotes: { zh: "", en: "" } },
      },
    })).toThrow("PLATFORM_EXPERIENCE_RESPONSE_INVALID");
  });

});
