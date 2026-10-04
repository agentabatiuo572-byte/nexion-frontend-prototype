import { describe, expect, it } from "vitest";
import * as stats from "./platform-stats";
const sources = import.meta.glob(["../App.vue", "../pages/me/language.vue", "../pages/onboarding/intro.vue"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
describe("public config and localized surfaces", () => {
  it("displays verified online devices rather than a derived estimate", () => {
    expect(stats).toHaveProperty("onlineDevicesOf");
    const online = (stats as unknown as { onlineDevicesOf(ps: { fleetDevices: number; onlineRatePct: number }): number }).onlineDevicesOf;
    expect(online({ fleetDevices: stats.FLEET_DEVICES, onlineRatePct: 80 })).toBe(22746);
    expect(sources["../pages/onboarding/intro.vue"]).toContain("cfg.config.verifiedStats?.onlineDevices.value");
    expect(sources["../pages/onboarding/intro.vue"]).not.toContain("onlineDevicesOf(cfg.config.publicStats)");
  });
  it("refreshes PC platform config on foreground", () => {
    expect(sources["../App.vue"].slice(sources["../App.vue"].indexOf("onShow(() =>"))).toContain("useConfig().load()");
  });
  it("lists the shipped interface languages without rollout labels", () => {
    expect(sources["../pages/me/language.vue"]).toContain("v-for=\"(l, i) in LOCALES\"");
    expect(sources["../pages/me/language.vue"]).not.toContain("priorityLabels");
  });
});
