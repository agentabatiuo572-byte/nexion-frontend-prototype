import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createCommissionConfigApi } from "./commission-config-api";
import { setCurrentCommerceSandboxRun } from "./order-api";

const payload = {
  source: "server",
  serverCanonical: true,
  sourceEnvironment: "SANDBOX",
  runId: "binary-run-20260819",
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
  it("accepts only the current explicit Sandbox RunID", async () => {
    setCurrentCommerceSandboxRun("binary-run-20260819");
    const request = vi.fn().mockResolvedValue(payload);
    const api = createCommissionConfigApi({ request } as unknown as ApiClient, "dev");
    await expect(api.binary()).resolves.toMatchObject({
      source: "server",
      serverCanonical: true,
      sourceEnvironment: "SANDBOX",
      runId: "binary-run-20260819",
    });
  });

  it("rejects a missing, stale, or cross-environment proof", async () => {
    setCurrentCommerceSandboxRun("binary-run-20260819");
    for (const invalid of [
      { ...payload, serverCanonical: undefined },
      { ...payload, source: "mock" },
      { ...payload, runId: "binary-run-20260818" },
      { ...payload, sourceEnvironment: "PRODUCTION", runId: null },
    ]) {
      const api = createCommissionConfigApi({ request: vi.fn().mockResolvedValue(invalid) } as unknown as ApiClient, "dev");
      await expect(api.binary()).rejects.toMatchObject({ message: "COMMISSION_CONFIG_RESPONSE_INVALID" });
    }
  });
});
