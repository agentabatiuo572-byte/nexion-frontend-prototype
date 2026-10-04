import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createCommissionConfigApi } from "./commission-config-api";

const RUN = "commission-run-20260817";
const OTHER_RUN = "commission-run-20260818";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    source: "nx_commission_rule + nx_config_item",
    serverCanonical: true,
    sourceEnvironment: "PRODUCTION",
    runId: null,
    unilevel: [
      { level: "L1", usdtPct: 10, nexReward: 50 },
      { level: "L2", usdtPct: 5, nexReward: 20 },
      { level: "L3", usdtPct: 3, nexReward: 10 },
      { level: "L4", usdtPct: 2, nexReward: 5 },
      { level: "L5", usdtPct: 1, nexReward: 2.5 },
      { level: "L6", usdtPct: 0.5, nexReward: 1 },
      { level: "L7", usdtPct: 0.5, nexReward: 1 },
    ],
    unilevelPaused: { L1: false, L2: true, L3: false, L4: false, L5: false, L6: false, L7: false },
    partnerTiersJson: JSON.stringify({ standard: 0, verified: 5000, premium: 50000, diamond: 500000 }),
    influenceClampMin: 1,
    influenceClampMax: 5,
    coolingDays: 30,
    promoMultiplier: 1,
    ...overrides,
  };
}

function binaryPayload(recentMatches: Record<string, unknown>[]) {
  return {
    source: "server",
    serverCanonical: true,
    sourceEnvironment: "PRODUCTION",
    runId: null,
    asOfDate: "2026-09-01",
    trackA: 1000,
    trackB: 1000,
    trackAMembers: 1,
    trackBMembers: 1,
    autoPlacedMembers: 0,
    matchRate: 0.1,
    threshold: 1000,
    dailyCap: 5000,
    periodCap: 150000,
    estimatedAmountUsdt: 0,
    settlePeriod: "monthly",
    residualPolicy: "carryForward",
    spilloverEnabled: true,
    gvReset: "monthly",
    paused: false,
    blockedReason: "F3_SETTLEMENT_NOT_DUE",
    recentMatches,
  };
}

describe("commission config provenance and protocol", () => {
  it("accepts canonical production rates and exposes every F2 field", async () => {
    const api = createCommissionConfigApi({ request: vi.fn().mockResolvedValue(payload()) } as unknown as ApiClient, "prod");
    await expect(api.rates()).resolves.toMatchObject({
      sourceEnvironment: "PRODUCTION", runId: null, coolingDays: 30, promoMultiplier: 1,
      partnerThresholds: { verified: 5000, premium: 50000 }, unilevelUsdt: { 1: 0.1, 7: 0.005 },
      unilevelPaused: { 1: false, 2: true, 7: false },
    });
  });

  it("accepts Java canonical production rates in development and rejects retired sandbox proofs", async () => {
    const api = createCommissionConfigApi({ request: vi.fn().mockResolvedValue(payload()) } as unknown as ApiClient, "dev");
    await expect(api.rates()).resolves.toMatchObject({ sourceEnvironment: "PRODUCTION", runId: null });
    await expect(createCommissionConfigApi({ request: vi.fn().mockResolvedValue(payload({ sourceEnvironment: "SANDBOX", runId: RUN })) } as unknown as ApiClient, "dev").rates()).rejects.toMatchObject({ kind: "protocol" });
    await expect(createCommissionConfigApi({ request: vi.fn().mockResolvedValue(payload({ runId: OTHER_RUN })) } as unknown as ApiClient, "dev").rates()).rejects.toMatchObject({ kind: "protocol" });
  });

  it("rejects malformed or non-canonical responses instead of applying local defaults", async () => {
    const malformed = payload({ unilevel: [{ level: "L1", usdtPct: 10, nexReward: 50 }] });
    await expect(createCommissionConfigApi({ request: vi.fn().mockResolvedValue(malformed) } as unknown as ApiClient, "prod").rates()).rejects.toMatchObject({ kind: "protocol" });
    await expect(createCommissionConfigApi({ request: vi.fn().mockResolvedValue(payload({ serverCanonical: false })) } as unknown as ApiClient, "prod").rates()).rejects.toMatchObject({ kind: "protocol" });
    await expect(createCommissionConfigApi({ request: vi.fn().mockResolvedValue(payload({ coolingDays: "not-a-number" })) } as unknown as ApiClient, "prod").rates()).rejects.toMatchObject({ kind: "protocol" });
  });

  it("preserves an explicitly missing cooling policy instead of inventing 30 days", async () => {
    const api = createCommissionConfigApi({
      request: vi.fn().mockResolvedValue(payload({ coolingDays: null })),
    } as unknown as ApiClient, "prod");

    await expect(api.rates()).resolves.toMatchObject({ coolingDays: null });
  });

  it("preserves every canonical binary settlement state without failing the full projection", async () => {
    const statuses = ["COOLING", "UNLOCKED", "PAID", "SETTLED", "FROZEN", "REVERSED", "REJECTED"];
    const recentMatches = statuses.map((status, index) => ({
      id: index + 1,
      amountUsdt: 10,
      status,
      createdAt: "2026-09-01T00:00:00Z",
      unlockAt: "2026-09-02T00:00:00Z",
    }));
    const api = createCommissionConfigApi({
      request: vi.fn().mockResolvedValue(binaryPayload(recentMatches)),
    } as unknown as ApiClient, "prod");

    await expect(api.binary()).resolves.toMatchObject({
      recentMatches: [
        { status: "cooling" },
        { status: "unlocked" },
        { status: "withdrawn" },
        { status: "withdrawn" },
        { status: "frozen" },
        { status: "reversed" },
        { status: "rejected" },
      ],
    });
  });
});
