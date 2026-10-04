import { describe, expect, it } from "vitest";
import { FLEET_DEVICES } from "@/lib/platform-stats";
import { parsePlatformPublicStats } from "./platform-config-api";

const values = {
  fleetDevices: FLEET_DEVICES,
  onlineRatePct: 100,
  onlineJitter: 20,
  registeredUsersBase: 1_420_000,
  registeredUsersMonthlyGrowthPct: 2.9,
  registeredUsersAnchorAt: 1_786_097_730_000,
  virtualUserCount: 12_000,
  hashratePercentileTable: [{ tops: 10, cumPct: 40 }, { tops: 20, cumPct: 100 }],
};

const production = {
  serverCanonical: true,
  source: "server:nx_config_item,nx_user",
  sourceEnvironment: "PRODUCTION",
  runId: "",
  version: 3,
  values,
  realUserCount: 4_321,
  effectiveAt: "2026-08-19T00:00:00Z",
};

describe("H9 public stats provenance", () => {
  it("accepts the exact production authority", () => {
    expect(parsePlatformPublicStats(production, "prod").authority).toEqual({
      source: "server:nx_config_item,nx_user",
      sourceEnvironment: "PRODUCTION",
      runId: "",
      version: 3,
    });
    expect(parsePlatformPublicStats(production, "prod").config).toMatchObject({
      fleetDevices: 0,
      onlineJitter: -1,
      registeredUsersMonthlyGrowthPct: -1,
      virtualUserCount: -1,
      realUserCount: 4_321,
    });
    expect(parsePlatformPublicStats({ ...production, values: undefined }, "prod").config.fleetDevices).toBe(0);
  });

  it("development consumes the same PC-backed canonical projection", () => {
    expect(parsePlatformPublicStats({
      ...production,
      sourceEnvironment: "PRODUCTION",
      runId: "",
    }, "dev").authority).toMatchObject({
      source: "server:nx_config_item,nx_user",
      sourceEnvironment: "PRODUCTION",
      runId: "",
    });
  });

  it.each([
    { serverCanonical: false },
    { source: "mock" },
    { sourceEnvironment: "SANDBOX", source: "mock", runId: "" },
    { sourceEnvironment: "SANDBOX", source: "server:nx_config_item,nx_user", runId: "run-20260819" },
  ])("rejects missing or contradictory authority: $sourceEnvironment/$source", (override) => {
    expect(() => parsePlatformPublicStats({ ...production, ...override }, "prod")).toThrow("H9_PUBLIC_STATS_RESPONSE_INVALID");
  });

  it("rejects a projection from the opposite runtime environment", () => {
    expect(parsePlatformPublicStats(production, "dev").authority.sourceEnvironment).toBe("PRODUCTION");
    expect(() => parsePlatformPublicStats({
      ...production,
      source: "mock",
      sourceEnvironment: "SANDBOX",
      runId: "home-public-stats-20260819",
    }, "dev")).toThrow("H9_PUBLIC_STATS_RESPONSE_INVALID");
  });
});
