import { describe, expect, it } from "vitest";
const source = (import.meta.glob("./intro.vue", {
  query: "?raw", import: "default", eager: true,
})["./intro.vue"] ?? "") as string;

describe("onboarding intro public fleet authority", () => {
  // The intro shows no platform statistics at all (no device count, no payout total) — slogan only.
  it("renders no fleet or payout statistic, so nothing waits on home truth", () => {
    expect(source).not.toMatch(/homeTruth|onlineDevicesOf|verifiedStats|publicStats|cumulativePaid|completedPayout|platform-stats/);
  });
});
