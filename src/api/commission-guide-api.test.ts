import { describe, expect, it, vi } from "vitest";
import { createCommissionGuideApi } from "./commission-guide-api";

export const guideFixture = {
  source: "server", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: null,
  coolingDays: 17, network: { depthGateLayer: 5, depthGateRank: 4, exitCapRate: .21 },
  binary: { threshold: 876.123456, matchRate: .1375, dailyCap: 6789, settlePeriod: "weekly", residualPolicy: "carryForward", paused: false },
  leadership: { rate: .0375, minRank: 4, monthlyCap: 4567 }, capabilities: { peer: false, genesis: false },
};
const ratesFixture = () => ({ source: "nx_commission_rule + nx_config_item", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: null,
  unilevel: Array.from({ length: 7 }, (_, i) => ({ level: `L${i + 1}`, usdtPct: i === 0 ? 12.3456 : 5, nexReward: 2.5 })) });

describe("commission guide narrow rate contract", () => {
  it("reads changed L1-L7 without requiring obsolete auxiliary fields or fixed policy totals", async () => {
    const request = vi.fn().mockResolvedValue(ratesFixture());
    const result = await createCommissionGuideApi({ request } as never).rates();
    expect(result.unilevelUsdt[1]).toBeCloseTo(.123456);
    expect(result.unilevelNex[7]).toBe(2.5);
    expect(request).toHaveBeenCalledWith({ method: "GET", path: "/api/config/commission/rates", authenticated: false });
    expect(result).not.toHaveProperty("coolingDays");
  });
  it.each(["missing", "duplicate", "malformed", "environment", "negative"])("rejects %s rate data without defaults", async fault => {
    const fixture = ratesFixture();
    if (fault === "missing") fixture.unilevel.pop();
    if (fault === "duplicate") fixture.unilevel[6].level = "L1";
    if (fault === "malformed") fixture.unilevel[0].usdtPct = "10garbage" as never;
    if (fault === "environment") fixture.sourceEnvironment = "SANDBOX";
    if (fault === "negative") fixture.unilevel[0].nexReward = -1;
    await expect(createCommissionGuideApi({ request: async () => fixture } as never).rates()).rejects.toThrow();
  });
});
describe("commission guide public API", () => {
  it("uses a public read and projects only validated rule fields", async () => {
    const request = vi.fn().mockResolvedValue({ ...guideFixture, privateField: "never expose" });
    const data = await createCommissionGuideApi({ request } as never, "dev").read();
    expect(data).toEqual(guideFixture);
    expect(request).toHaveBeenCalledWith({ method: "GET", path: "/api/config/commission/guide", authenticated: false });
  });
  it("preserves missing configuration as null and legitimate zero values as zero", async () => {
    const fixture = { ...guideFixture, coolingDays: 0, binary: null, leadership: { rate: 0, minRank: 1, monthlyCap: 0 }, network: { depthGateLayer: null, depthGateRank: null, exitCapRate: null } };
    expect(await createCommissionGuideApi({ request: async () => fixture } as never).read()).toEqual(fixture);
  });
  it.each([
    { coolingDays: undefined }, { coolingDays: -1 }, { coolingDays: 1.5 },
    { serverCanonical: false }, { sourceEnvironment: "SANDBOX", runId: "wrong" }, { source: "mock" },
    { network: { ...guideFixture.network, depthGateLayer: 8 } },
    { binary: { ...guideFixture.binary, matchRate: 13 } },
    { binary: { ...guideFixture.binary, settlePeriod: "bad" } },
    { binary: { ...guideFixture.binary, residualPolicy: "bad" } },
    { leadership: { ...guideFixture.leadership, minRank: 13 } },
    { capabilities: { peer: "false", genesis: false } },
  ])("rejects malformed or wrong-environment facts %#", async patch => {
    await expect(createCommissionGuideApi({ request: async () => ({ ...guideFixture, ...patch }) } as never).read()).rejects.toThrow("COMMISSION_GUIDE_RESPONSE_INVALID");
  });
  it("does not substitute defaults on transport errors", async () => {
    await expect(createCommissionGuideApi({ request: async () => { throw new Error("503"); } } as never).read()).rejects.toThrow("503");
  });
});
