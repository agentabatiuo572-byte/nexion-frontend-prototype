import { afterEach, describe, expect, it, vi } from "vitest";
import appSource from "../App.vue?raw";
import { formatTrialDate, formatTrialDateTime } from "./trial-date";

afterEach(() => vi.unstubAllEnvs());

describe("trial dates", () => {
  it("renders numeric dates on Android and keeps the local date of the server instant", () => {
    const serverInstant = Date.parse("2026-09-25T17:30:04Z");
    vi.stubEnv("TZ", "Asia/Ho_Chi_Minh");
    expect(formatTrialDate(serverInstant)).toBe("2026/09/26");
    expect(formatTrialDateTime(serverInstant)).toBe("2026/09/26 00:30:04");
    vi.stubEnv("TZ", "America/Los_Angeles");
    expect(formatTrialDate(serverInstant)).toBe("2026/09/25");
    expect(formatTrialDateTime(serverInstant)).toBe("2026/09/25 10:30:04");
  });

  it("uses the same formatter in the active-to-grace toast", () => {
    expect(appSource).toContain("formatTrialDateTime(freeTrial.graceEndsAt, dateLocale())");
    expect(appSource).not.toContain("freeTrial.graceEndsAt).toLocaleString(");
  });

  it("keeps invalid or missing timestamps unknown and keeps zero timestamps unknown", () => {
    vi.stubEnv("TZ", "Asia/Tokyo");
    for (const value of [NaN, Infinity, -Infinity, 8.64e15 + 1, -8.64e15 - 1, undefined, null, "", "not-a-date"]) {
      expect(formatTrialDate(value as number)).toBe("—");
      expect(formatTrialDateTime(value as number)).toBe("—");
    }
    expect(formatTrialDate(0)).toBe("—");
    expect(formatTrialDateTime(0)).toBe("—");
  });
});
