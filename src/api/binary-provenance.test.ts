import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createCommissionConfigApi } from "./commission-config-api";

const payload = {
  source: "server",
  serverCanonical: true,
  sourceEnvironment: "PRODUCTION",
  runId: null,
  asOfDate: "2026-08-19",
  trackA: 100,
  trackB: 200,
  trackAMembers: 1,
  trackBMembers: 2,
  autoPlacedMembers: 0,
  matchRate: 0.1,
  threshold: 50,
  dailyCap: 5000,
  periodCap: 5000,
  estimatedAmountUsdt: 10,
  settlePeriod: "daily",
  residualPolicy: "carryForward",
  spilloverEnabled: true,
  gvReset: "monthly",
  paused: false,
  blockedReason: "",
  recentMatches: [],
};

describe("binary projection provenance", () => {
  it("accepts the Java canonical production projection in development", async () => {
    const request = vi.fn().mockResolvedValue(payload);
    const api = createCommissionConfigApi({ request } as unknown as ApiClient, "dev");
    await expect(api.binary()).resolves.toMatchObject({
      source: "server",
      serverCanonical: true,
      sourceEnvironment: "PRODUCTION",
      runId: null,
    });
  });

  it("rejects missing authority, mock data, and retired Sandbox provenance", async () => {
    for (const invalid of [
      { ...payload, serverCanonical: undefined },
      { ...payload, source: "mock" },
      { ...payload, sourceEnvironment: "SANDBOX", runId: "binary-run-20260819" },
      { ...payload, runId: "binary-run-20260819" },
    ]) {
      const api = createCommissionConfigApi({ request: vi.fn().mockResolvedValue(invalid) } as unknown as ApiClient, "dev");
      await expect(api.binary()).rejects.toMatchObject({ message: "COMMISSION_CONFIG_RESPONSE_INVALID" });
    }
  });
});
